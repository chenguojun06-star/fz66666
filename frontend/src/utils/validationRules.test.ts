import { describe, expect, it } from 'vitest';
import {
  validate,
  isValid,
  validateBatch,
  getAllRuleNames,
  ValidationRules,
} from './validationRules';

describe('validationRules', () => {
  // ─────────────────── validate() ───────────────────

  describe('validate()', () => {
    it('returns null for unknown rule name when notified', () => {
      expect(validate('anything', 'nonExistentRule')).toBe('规则未定义');
    });

    // username
    it('username: passes valid input', () => {
      expect(validate('alice123', 'username')).toBeNull();
      expect(validate('user_name-01', 'username')).toBeNull();
    });

    it('username: fails on empty value (required)', () => {
      expect(validate('', 'username')).toBe('账号 不能为空');
      expect(validate(null, 'username')).toBe('账号 不能为空');
      expect(validate(undefined, 'username')).toBe('账号 不能为空');
    });

    it('username: fails below minLength 3', () => {
      const err = validate('ab', 'username');
      expect(err).toContain('3');
    });

    it('username: fails above maxLength 20', () => {
      const err = validate('a'.repeat(21), 'username');
      expect(err).toContain('20');
    });

    it('username: fails with invalid characters', () => {
      const err = validate('user name!', 'username');
      expect(err).not.toBeNull();
    });

    // password
    it('password: passes valid 8-char password', () => {
      expect(validate('pass1234', 'password')).toBeNull();
    });

    it('password: fails below minLength 6', () => {
      const err = validate('abc', 'password');
      expect(err).toContain('6');
    });

    it('password: fails above maxLength 20', () => {
      const err = validate('a'.repeat(21), 'password');
      expect(err).toContain('20');
    });

    // phone
    it('phone: passes valid Chinese mobile number', () => {
      expect(validate('13812345678', 'phone')).toBeNull();
      expect(validate('19987654321', 'phone')).toBeNull();
    });

    it('phone: fails invalid number (wrong prefix)', () => {
      const err = validate('12345678901', 'phone');
      expect(err).not.toBeNull();
    });

    it('phone: fails too short', () => {
      expect(validate('1381234567', 'phone')).not.toBeNull();
    });

    it('phone: fails empty (required)', () => {
      expect(validate('', 'phone')).toBe('手机号 不能为空');
    });

    // email
    it('email: passes valid email', () => {
      expect(validate('user@example.com', 'email')).toBeNull();
    });

    it('email: fails invalid format', () => {
      expect(validate('not-an-email', 'email')).not.toBeNull();
      expect(validate('missing@tld', 'email')).not.toBeNull();
    });

    it('email: fails empty (required)', () => {
      expect(validate('', 'email')).toBe('邮箱 不能为空');
    });

    // orderNo
    it('orderNo: passes valid order number (5-50 chars)', () => {
      expect(validate('PO001', 'orderNo')).toBeNull();
      expect(validate('ORDER2024001', 'orderNo')).toBeNull();
    });

    it('orderNo: fails below minLength 5', () => {
      expect(validate('P001', 'orderNo')).not.toBeNull();
    });

    // styleNo
    it('styleNo: passes valid 3-char style number', () => {
      expect(validate('FZ1', 'styleNo')).toBeNull();
    });

    it('styleNo: fails below minLength 3', () => {
      expect(validate('AB', 'styleNo')).not.toBeNull();
    });

    // quantity (integer type)
    it('quantity: passes valid positive integer', () => {
      expect(validate(50, 'quantity')).toBeNull();
      expect(validate('100', 'quantity')).toBeNull();
    });

    it('quantity: fails zero', () => {
      expect(validate(0, 'quantity')).not.toBeNull();
    });

    it('quantity: fails non-integer', () => {
      expect(validate('abc', 'quantity')).not.toBeNull();
    });
  });

  // ─────────────────── isValid() ───────────────────

  describe('isValid()', () => {
    it('returns true when validate returns null', () => {
      expect(isValid('alice', 'username')).toBe(true);
    });

    it('returns false when validate returns error', () => {
      expect(isValid('', 'username')).toBe(false);
      expect(isValid('ab', 'username')).toBe(false);
    });
  });

  // ─────────────────── validateBatch() ───────────────────

  describe('validateBatch()', () => {
    it('returns valid=true when all fields pass', () => {
      const data = { username: 'alice123', phone: '13812345678' };
      const fields = { username: 'username', phone: 'phone' };
      const result = validateBatch(data, fields);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('returns valid=false and populates errors when any field fails', () => {
      const data = { username: 'alice123', phone: 'invalid-phone' };
      const fields = { username: 'username', phone: 'phone' };
      const result = validateBatch(data, fields);
      expect(result.valid).toBe(false);
      expect(result.errors.phone).toBeDefined();
      expect(result.errors.username).toBeUndefined();
    });

    it('collects all errors when multiple fields fail', () => {
      const data = { username: '', phone: '' };
      const fields = { username: 'username', phone: 'phone' };
      const result = validateBatch(data, fields);
      expect(result.valid).toBe(false);
      expect(result.errors.username).toBeDefined();
      expect(result.errors.phone).toBeDefined();
    });
  });

  // ─────────────────── getAllRuleNames() ───────────────────

  describe('getAllRuleNames()', () => {
    it('returns an array containing standard rule names', () => {
      const names = getAllRuleNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names).toContain('username');
      expect(names).toContain('password');
      expect(names).toContain('phone');
      expect(names).toContain('email');
      expect(names).toContain('orderNo');
    });

    it('count matches the number of defined rules', () => {
      const names = getAllRuleNames();
      expect(names.length).toBe(Object.keys(ValidationRules).length);
    });
  });
});
