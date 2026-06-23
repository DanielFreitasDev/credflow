import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { dateInputToIso } from '../lib/format';
import { Customer } from '../lib/types';
import { useToast } from '../lib/toast';
import { LoadingState, PageHeader, Select, Spinner } from '../components/ui';

const schema = z.object({
  type: z.enum(['INDIVIDUAL', 'COMPANY']),
  name: z.string().min(2, 'Informe o nome'),
  tradeName: z.string().optional(),
  document: z.string().min(11, 'Documento inválido'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  foundationDate: z.string().optional(),
  occupation: z.string().optional(),
  monthlyIncome: z.coerce.number().min(0),
  internalScore: z.coerce.number().int('Use um número inteiro').min(0).max(1000),
  status: z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE', 'BLOCKED']),
  notes: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CustomerFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'INDIVIDUAL', status: 'PROSPECT', monthlyIncome: 0, internalScore: 500 },
  });

  const type = watch('type');

  const { data: existing, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => (await api.get<Customer>(`/customers/${id}`)).data,
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      reset({
        type: existing.type,
        name: existing.name,
        tradeName: existing.tradeName ?? '',
        document: existing.document,
        email: existing.email ?? '',
        phone: existing.phone ?? '',
        birthDate: existing.birthDate?.slice(0, 10) ?? '',
        foundationDate: existing.foundationDate?.slice(0, 10) ?? '',
        occupation: existing.occupation ?? '',
        monthlyIncome: existing.monthlyIncome,
        internalScore: existing.internalScore,
        status: existing.status,
        notes: existing.notes ?? '',
        street: existing.address?.street ?? '',
        number: existing.address?.number ?? '',
        district: existing.address?.district ?? '',
        city: existing.address?.city ?? '',
        state: existing.address?.state ?? '',
        zipCode: existing.address?.zipCode ?? '',
      });
    }
  }, [existing, reset]);

  const onSubmit = async (v: FormValues) => {
    const payload: Record<string, unknown> = {
      type: v.type,
      name: v.name,
      tradeName: v.tradeName || undefined,
      document: v.document,
      email: v.email || undefined,
      phone: v.phone || undefined,
      birthDate: v.type === 'INDIVIDUAL' && v.birthDate ? dateInputToIso(v.birthDate) : undefined,
      foundationDate: v.type === 'COMPANY' && v.foundationDate ? dateInputToIso(v.foundationDate) : undefined,
      occupation: v.occupation || undefined,
      monthlyIncome: v.monthlyIncome,
      internalScore: v.internalScore,
      status: v.status,
      notes: v.notes || undefined,
    };
    if (v.street && v.city && v.state && v.zipCode) {
      payload.address = {
        street: v.street,
        number: v.number || undefined,
        district: v.district || undefined,
        city: v.city,
        state: v.state,
        zipCode: v.zipCode,
      };
    }

    try {
      const res = isEdit
        ? await api.patch<Customer>(`/customers/${id}`, payload)
        : await api.post<Customer>('/customers', payload);
      toast.success(isEdit ? 'Cliente atualizado' : 'Cliente cadastrado');
      qc.invalidateQueries({ queryKey: ['customers'] });
      navigate(`/customers/${res.data.id}`);
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  if (isEdit && isLoading) return <LoadingState />;

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>
      <PageHeader title={isEdit ? 'Editar cliente' : 'Novo cliente'} />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <section className="card space-y-4 p-6">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Identificação</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="cf-type">
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select
                    id="cf-type"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    options={[
                      { value: 'INDIVIDUAL', label: 'Pessoa Física' },
                      { value: 'COMPANY', label: 'Pessoa Jurídica' },
                    ]}
                  />
                )}
              />
            </Field>
            <Field label="Status" htmlFor="cf-status">
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select
                    id="cf-status"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    options={[
                      { value: 'PROSPECT', label: 'Prospect' },
                      { value: 'ACTIVE', label: 'Ativo' },
                      { value: 'INACTIVE', label: 'Inativo' },
                      { value: 'BLOCKED', label: 'Bloqueado' },
                    ]}
                  />
                )}
              />
            </Field>
            <Field label={type === 'COMPANY' ? 'Razão social' : 'Nome completo'} htmlFor="cf-name" error={errors.name?.message}>
              <input id="cf-name" className="input" {...register('name')} />
            </Field>
            {type === 'COMPANY' && (
              <Field label="Nome fantasia" htmlFor="cf-tradeName">
                <input id="cf-tradeName" className="input" {...register('tradeName')} />
              </Field>
            )}
            <Field label={type === 'COMPANY' ? 'CNPJ' : 'CPF'} htmlFor="cf-document" error={errors.document?.message}>
              <input id="cf-document" className="input" placeholder="apenas dígitos ou formatado" {...register('document')} />
            </Field>
            <Field label={type === 'COMPANY' ? 'Data de fundação' : 'Data de nascimento'} htmlFor="cf-date">
              <input id="cf-date" type="date" className="input" {...register(type === 'COMPANY' ? 'foundationDate' : 'birthDate')} />
            </Field>
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Contato e perfil financeiro</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="E-mail" htmlFor="cf-email" error={errors.email?.message}>
              <input id="cf-email" className="input" {...register('email')} />
            </Field>
            <Field label="Telefone" htmlFor="cf-phone">
              <input id="cf-phone" className="input" {...register('phone')} />
            </Field>
            <Field label={type === 'COMPANY' ? 'Ramo de atividade' : 'Profissão'} htmlFor="cf-occupation">
              <input id="cf-occupation" className="input" {...register('occupation')} />
            </Field>
            <Field label={type === 'COMPANY' ? 'Faturamento mensal (R$)' : 'Renda mensal (R$)'} htmlFor="cf-monthlyIncome">
              <input id="cf-monthlyIncome" type="number" step="0.01" className="input" {...register('monthlyIncome')} />
            </Field>
            <Field label="Score interno (0–1000)" htmlFor="cf-internalScore">
              <input id="cf-internalScore" type="number" className="input" {...register('internalScore')} />
            </Field>
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Endereço</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
            <div className="sm:col-span-4"><Field label="Logradouro" htmlFor="cf-street"><input id="cf-street" className="input" {...register('street')} /></Field></div>
            <div className="sm:col-span-2"><Field label="Número" htmlFor="cf-number"><input id="cf-number" className="input" {...register('number')} /></Field></div>
            <div className="sm:col-span-3"><Field label="Bairro" htmlFor="cf-district"><input id="cf-district" className="input" {...register('district')} /></Field></div>
            <div className="sm:col-span-3"><Field label="Cidade" htmlFor="cf-city"><input id="cf-city" className="input" {...register('city')} /></Field></div>
            <div className="sm:col-span-4"><Field label="CEP" htmlFor="cf-zipCode"><input id="cf-zipCode" className="input" {...register('zipCode')} /></Field></div>
            <div className="sm:col-span-2"><Field label="UF" htmlFor="cf-state"><input id="cf-state" maxLength={2} className="input uppercase" {...register('state')} /></Field></div>
          </div>
        </section>

        <section className="card p-6">
          <Field label="Observações" htmlFor="cf-notes">
            <textarea id="cf-notes" rows={3} className="input" {...register('notes')} />
          </Field>
        </section>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting && <Spinner className="h-4 w-4" />}
            {isEdit ? 'Salvar alterações' : 'Cadastrar cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, error, htmlFor, children }: { label: string; error?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
