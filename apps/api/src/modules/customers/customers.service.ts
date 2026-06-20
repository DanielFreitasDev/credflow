import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContractStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { buildPagination, paginatedResponse } from '../../common/utils/pagination.util';
import { isValidDocument, onlyDigits } from '../../common/utils/document.util';
import {
  CreateCustomerDto,
  CustomerQueryDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService,
  ) {}

  /** Document numbers are stored encrypted at rest; decrypt for the 360 view. */
  private decryptDocuments<T extends { documents?: { number: string | null }[] }>(customer: T): T {
    if (customer.documents) {
      for (const doc of customer.documents) {
        if (doc.number) {
          try {
            doc.number = this.encryption.decrypt(doc.number);
          } catch {
            /* value was stored in plaintext (e.g. seed) — leave as is */
          }
        }
      }
    }
    return customer;
  }

  private normalizeAndValidateDocument(document: string, type: 'INDIVIDUAL' | 'COMPANY'): string {
    const digits = onlyDigits(document);
    if (!isValidDocument(digits, type)) {
      throw new BadRequestException(
        type === 'INDIVIDUAL' ? 'Invalid CPF' : 'Invalid CNPJ',
      );
    }
    return digits;
  }

  async create(dto: CreateCustomerDto, actorId?: string) {
    const document = this.normalizeAndValidateDocument(dto.document, dto.type);

    const customer = await this.prisma.customer.create({
      data: {
        type: dto.type,
        status: dto.status ?? 'PROSPECT',
        name: dto.name,
        tradeName: dto.tradeName,
        document,
        email: dto.email,
        phone: dto.phone,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        foundationDate: dto.foundationDate ? new Date(dto.foundationDate) : null,
        occupation: dto.occupation,
        employerName: dto.employerName,
        employmentType: dto.employmentType,
        monthlyIncome: dto.monthlyIncome ?? 0,
        internalScore: dto.internalScore ?? 500,
        notes: dto.notes,
        createdById: actorId,
        address: dto.address ? { create: { ...dto.address, country: dto.address.country ?? 'BR' } } : undefined,
        contacts: dto.contacts?.length ? { create: dto.contacts } : undefined,
        documents: dto.documents?.length
          ? {
              create: dto.documents.map((d) => ({
                ...d,
                number: d.number ? this.encryption.encrypt(d.number) : null,
                issueDate: d.issueDate ? new Date(d.issueDate) : null,
              })),
            }
          : undefined,
      },
      include: { address: true, contacts: true, documents: true },
    });

    await this.audit.record({
      userId: actorId,
      action: 'CREATE',
      entity: 'Customer',
      entityId: customer.id,
      after: { document: customer.document, name: customer.name, type: customer.type },
    });
    return customer;
  }

  async findAll(query: CustomerQueryDto) {
    const { skip, take, page, pageSize } = buildPagination(query);
    const where: Prisma.CustomerWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { tradeName: { contains: query.search, mode: 'insensitive' } },
              { document: { contains: onlyDigits(query.search) || query.search } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder },
        include: { address: true, _count: { select: { proposals: true, contracts: true } } },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return paginatedResponse(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        address: true,
        contacts: true,
        documents: true,
        proposals: { orderBy: { createdAt: 'desc' }, take: 10 },
        contracts: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.decryptDocuments(customer);
  }

  /** Aggregated financial history used in the customer 360 view. */
  async getFinancialHistory(id: string) {
    await this.ensureExists(id);

    const contracts = await this.prisma.contract.findMany({
      where: { customerId: id },
      include: {
        installments: { select: { amountDue: true, amountPaid: true, status: true } },
      },
    });

    let totalBorrowed = 0;
    let totalPaid = 0;
    let outstanding = 0;
    let overdue = 0;
    for (const c of contracts) {
      totalBorrowed += Number(c.principal);
      for (const i of c.installments) {
        const due = Number(i.amountDue);
        const paid = Number(i.amountPaid);
        totalPaid += paid;
        if (i.status !== 'PAID' && i.status !== 'CANCELLED') outstanding += due - paid;
        if (i.status === 'OVERDUE') overdue += due - paid;
      }
    }

    const activeContracts = contracts.filter((c) => c.status === ContractStatus.ACTIVE).length;
    const defaultedContracts = contracts.filter((c) => c.status === ContractStatus.DEFAULTED).length;

    return {
      totalContracts: contracts.length,
      activeContracts,
      defaultedContracts,
      totalBorrowed: round2(totalBorrowed),
      totalPaid: round2(totalPaid),
      outstanding: round2(outstanding),
      overdue: round2(overdue),
    };
  }

  async update(id: string, dto: UpdateCustomerDto, actorId?: string) {
    const before = await this.ensureExists(id);

    let document: string | undefined;
    if (dto.document) {
      document = this.normalizeAndValidateDocument(dto.document, dto.type ?? before.type);
    }

    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        type: dto.type,
        status: dto.status,
        name: dto.name,
        tradeName: dto.tradeName,
        ...(document ? { document } : {}),
        email: dto.email,
        phone: dto.phone,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        foundationDate: dto.foundationDate ? new Date(dto.foundationDate) : undefined,
        occupation: dto.occupation,
        employerName: dto.employerName,
        employmentType: dto.employmentType,
        monthlyIncome: dto.monthlyIncome,
        internalScore: dto.internalScore,
        notes: dto.notes,
        address: dto.address
          ? {
              upsert: {
                create: { ...dto.address, country: dto.address.country ?? 'BR' },
                update: { ...dto.address },
              },
            }
          : undefined,
      },
      include: { address: true, contacts: true, documents: true },
    });

    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Customer',
      entityId: id,
      before: { name: before.name, status: before.status, monthlyIncome: Number(before.monthlyIncome) },
      after: { name: customer.name, status: customer.status, monthlyIncome: Number(customer.monthlyIncome) },
    });
    return customer;
  }

  async updateStatus(id: string, status: 'PROSPECT' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED', reason?: string, actorId?: string) {
    const before = await this.ensureExists(id);
    const customer = await this.prisma.customer.update({ where: { id }, data: { status } });
    await this.audit.record({
      userId: actorId,
      action: 'STATUS_CHANGE',
      entity: 'Customer',
      entityId: id,
      before: { status: before.status },
      after: { status, reason },
    });
    return customer;
  }

  async updateScore(id: string, score: number, reason?: string, actorId?: string) {
    const before = await this.ensureExists(id);
    const customer = await this.prisma.customer.update({ where: { id }, data: { internalScore: score } });
    await this.audit.record({
      userId: actorId,
      action: 'SCORE_CHANGE',
      entity: 'Customer',
      entityId: id,
      before: { internalScore: before.internalScore },
      after: { internalScore: score, reason },
    });
    return customer;
  }

  private async ensureExists(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
