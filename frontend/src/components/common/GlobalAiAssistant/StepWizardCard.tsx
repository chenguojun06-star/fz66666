import React, { useState, useCallback } from 'react';
import styles from './StepWizardCard.module.css';

export interface WizardStepOption {
  label: string;
  value: string;
  desc?: string;
  icon?: string;
}

export interface WizardStepField {
  key: string;
  label: string;
  inputType: 'select' | 'multi_select' | 'text' | 'number' | 'date';
  placeholder?: string;
  required?: boolean;
  options?: WizardStepOption[];
  min?: number;
  max?: number;
}

export interface WizardStep {
  stepKey: string;
  title: string;
  desc?: string;
  fields: WizardStepField[];
}

export interface StepWizardCardData {
  wizardType: string;
  title: string;
  desc?: string;
  icon?: string;
  steps: WizardStep[];
  submitLabel?: string;
  submitCommand: string;
  prefilledData?: Record<string, unknown>;
  styleNo?: string;
  orderNo?: string;
}

interface StepWizardCardProps {
  data: StepWizardCardData;
  onSubmit: (command: string, params: Record<string, unknown>) => void;
}

export default function StepWizardCard({ data, onSubmit }: StepWizardCardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, unknown>>(data.prefilledData || {});
  const [submitted, setSubmitted] = useState(false);

  const step = data.steps[currentStep];
  const isLastStep = currentStep === data.steps.length - 1;

  const updateField = useCallback((key: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleMultiSelect = useCallback((key: string, value: string) => {
    setFormData(prev => {
      const current = (prev[key] as string[]) || [];
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }, []);

  const canNext = () => {
    if (!step) return false;
    return step.fields.every(f => {
      if (!f.required) return true;
      const val = formData[f.key];
      if (f.inputType === 'multi_select') return Array.isArray(val) && val.length > 0;
      return val !== undefined && val !== null && val !== '';
    });
  };

  const handleNext = () => {
    if (isLastStep) {
      setSubmitted(true);
      onSubmit(data.submitCommand, formData);
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  if (submitted) {
    return (
      <div className={styles.card}>
        <div className={styles.successIcon}>✅</div>
        <div className={styles.successText}>指令已提交，小云正在处理…</div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.icon}>{data.icon || '📋'}</span>
        <div className={styles.headerText}>
          <div className={styles.title}>{data.title}</div>
          {data.desc && <div className={styles.desc}>{data.desc}</div>}
        </div>
      </div>

      <div className={styles.stepBar}>
        {data.steps.map((s, i) => (
          <div key={s.stepKey} className={`${styles.stepDot} ${i <= currentStep ? styles.stepActive : ''} ${i < currentStep ? styles.stepDone : ''}`}>
            <span className={styles.stepNum}>{i < currentStep ? '✓' : i + 1}</span>
            <span className={styles.stepLabel}>{s.title}</span>
          </div>
        ))}
      </div>

      {step && (
        <div className={styles.stepContent}>
          {step.desc && <div className={styles.stepDesc}>{step.desc}</div>}
          {step.fields.map(field => (
            <div key={field.key} className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                {field.label}
                {field.required && <span className={styles.required}>*</span>}
              </label>

              {field.inputType === 'select' && field.options && (
                <div className={styles.optionGrid}>
                  {field.options.map(opt => (
                    <button
                      key={opt.value}
                      className={`${styles.optionBtn} ${formData[field.key] === opt.value ? styles.optionSelected : ''}`}
                      onClick={() => updateField(field.key, opt.value)}
                    >
                      {opt.icon && <span className={styles.optIcon}>{opt.icon}</span>}
                      <span className={styles.optLabel}>{opt.label}</span>
                      {opt.desc && <span className={styles.optDesc}>{opt.desc}</span>}
                    </button>
                  ))}
                </div>
              )}

              {field.inputType === 'multi_select' && field.options && (
                <div className={styles.optionGrid}>
                  {field.options.map(opt => {
                    const selected = ((formData[field.key] as string[]) || []).includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        className={`${styles.optionBtn} ${selected ? styles.optionSelected : ''}`}
                        onClick={() => toggleMultiSelect(field.key, opt.value)}
                      >
                        {opt.icon && <span className={styles.optIcon}>{opt.icon}</span>}
                        <span className={styles.optLabel}>{opt.label}</span>
                        {opt.desc && <span className={styles.optDesc}>{opt.desc}</span>}
                        {selected && <span className={styles.checkMark}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {field.inputType === 'text' && (
                <input
                  className={styles.textInput}
                  type="text"
                  placeholder={field.placeholder || `请输入${field.label}`}
                  value={(formData[field.key] as string) || ''}
                  onChange={e => updateField(field.key, e.target.value)}
                />
              )}

              {field.inputType === 'number' && (
                <input
                  className={styles.textInput}
                  type="number"
                  placeholder={field.placeholder || `请输入${field.label}`}
                  min={field.min}
                  max={field.max}
                  value={(formData[field.key] as number) || ''}
                  onChange={e => updateField(field.key, Number(e.target.value))}
                />
              )}

              {field.inputType === 'date' && (
                <input
                  className={styles.textInput}
                  type="date"
                  value={(formData[field.key] as string) || ''}
                  onChange={e => updateField(field.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className={styles.footer}>
        {currentStep > 0 && (
          <button className={styles.prevBtn} onClick={handlePrev}>上一步</button>
        )}
        <button
          className={`${styles.nextBtn} ${!canNext() ? styles.nextDisabled : ''}`}
          onClick={handleNext}
          disabled={!canNext()}
        >
          {isLastStep ? (data.submitLabel || '确认提交') : '下一步'}
        </button>
      </div>
    </div>
  );
}
