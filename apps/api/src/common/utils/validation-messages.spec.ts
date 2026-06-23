import { BadRequestException, ValidationError } from '@nestjs/common';
import { validationExceptionFactory } from './validation-messages';

const err = (property: string, constraints: Record<string, string>, children?: ValidationError[]): ValidationError => ({
  property,
  constraints,
  children: children ?? [],
});

const messagesOf = (errors: ValidationError[]): string[] => {
  const ex = validationExceptionFactory(errors);
  const body = ex.getResponse() as { message: string[] };
  return body.message;
};

describe('validationExceptionFactory', () => {
  it('returns a BadRequestException (400) with a pt-BR message envelope', () => {
    const ex = validationExceptionFactory([err('email', { isEmail: 'email must be an email' })]);
    expect(ex).toBeInstanceOf(BadRequestException);
    expect(ex.getStatus()).toBe(400);
    const body = ex.getResponse() as { statusCode: number; error: string; message: string[] };
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('BadRequest');
    expect(body.message).toEqual(['E-mail deve ser um e-mail válido']);
  });

  it('maps known fields to pt-BR labels', () => {
    expect(messagesOf([err('approvedAmount', { isPositive: 'x' })])).toEqual([
      'Valor aprovado deve ser um valor positivo',
    ]);
    expect(messagesOf([err('termMonths', { isInt: 'x' })])).toEqual(['Prazo (meses) deve ser um número inteiro']);
  });

  it('extracts the numeric bound from min/max/length constraints', () => {
    expect(messagesOf([err('termMonths', { max: 'termMonths must not be greater than 600' })])).toEqual([
      'Prazo (meses) deve ser menor ou igual a 600',
    ]);
    expect(messagesOf([err('newPassword', { minLength: 'newPassword must be longer than or equal to 12 characters' })])).toEqual([
      'Nova senha deve ter no mínimo 12 caracteres',
    ]);
    expect(messagesOf([err('name', { maxLength: 'name must be shorter than or equal to 120 characters' })])).toEqual([
      'Nome deve ter no máximo 120 caracteres',
    ]);
  });

  it('falls back to the raw property name for unknown fields', () => {
    expect(messagesOf([err('weirdField', { isString: 'x' })])).toEqual(['weirdField deve ser um texto']);
  });

  it('falls back to a generic pt-BR message for unknown constraints', () => {
    expect(messagesOf([err('status', { somethingNew: 'x' })])).toEqual(['Status é inválido']);
  });

  it('flattens nested (ValidateNested) errors', () => {
    const nested = err('contacts', {}, [err('email', { isEmail: 'x' })]);
    expect(messagesOf([nested])).toEqual(['E-mail deve ser um e-mail válido']);
  });

  it('reports every constraint on a field', () => {
    const messages = messagesOf([err('password', { isString: 'x', minLength: 'min 12 characters' })]);
    expect(messages).toContain('Senha deve ser um texto');
    expect(messages).toContain('Senha deve ter no mínimo 12 caracteres');
  });

  it('produces a safe default when there are no constraints', () => {
    expect(messagesOf([err('whatever', {})])).toEqual(['Dados inválidos']);
  });
});
