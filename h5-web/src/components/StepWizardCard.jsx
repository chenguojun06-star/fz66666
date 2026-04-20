import React, { useState, useCallback } from 'react';
import './StepWizardCard.css';

export default function StepWizardCard({ data, onSubmit }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState(data.prefilledData || {});
  const [submitted, setSubmitted] = useState(false);

  const step = data.steps?.[currentStep];
  const isLastStep = currentStep === data.steps.length - 1;

  const updateField = useCallback((key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleMultiSelect = useCallback((key, value) => {
    setFormData(prev => {
      const current = prev[key] || [];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
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
      onSubmit?.(data.submitCommand, formData);
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  if (submitted) {
    return <div className="sw-card"><div className="sw-success">✅ 指令已提交，小云正在处理…</div></div>;
  }

  return (
    <div className="sw-card">
      <div className="sw-header">
        <span className="sw-icon">{data.icon || '📋'}</span>
        <div className="sw-title">{data.title}</div>
      </div>
      <div className="sw-steps">
        {data.steps.map((s, i) => (
          <span key={s.stepKey} className={`sw-step-dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`}>
            {i < currentStep ? '✓' : i + 1}
          </span>
        ))}
      </div>
      {step && (
        <div className="sw-content">
          {step.desc && <div className="sw-step-desc">{step.desc}</div>}
          {step.fields.map(field => (
            <div key={field.key} className="sw-field">
              <label className="sw-label">{field.label}{field.required && <span className="sw-required">*</span>}</label>
              {field.inputType === 'select' && field.options && (
                <div className="sw-options">
                  {field.options.map(opt => (
                    <button key={opt.value} className={`sw-opt-btn ${formData[field.key] === opt.value ? 'selected' : ''}`}
                      onClick={() => updateField(field.key, opt.value)}>
                      {opt.icon && <span>{opt.icon}</span>} {opt.label}
                    </button>
                  ))}
                </div>
              )}
              {field.inputType === 'multi_select' && field.options && (
                <div className="sw-options">
                  {field.options.map(opt => {
                    const sel = (formData[field.key] || []).includes(opt.value);
                    return (
                      <button key={opt.value} className={`sw-opt-btn ${sel ? 'selected' : ''}`}
                        onClick={() => toggleMultiSelect(field.key, opt.value)}>
                        {opt.icon && <span>{opt.icon}</span>} {opt.label} {sel && '✓'}
                      </button>
                    );
                  })}
                </div>
              )}
              {field.inputType === 'text' && (
                <input className="sw-input" type="text" placeholder={field.placeholder || field.label}
                  value={formData[field.key] || ''} onChange={e => updateField(field.key, e.target.value)} />
              )}
              {field.inputType === 'number' && (
                <input className="sw-input" type="number" placeholder={field.placeholder || field.label}
                  min={field.min} value={formData[field.key] || ''} onChange={e => updateField(field.key, Number(e.target.value))} />
              )}
              {field.inputType === 'date' && (
                <input className="sw-input" type="date" value={formData[field.key] || ''}
                  onChange={e => updateField(field.key, e.target.value)} />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="sw-footer">
        {currentStep > 0 && <button className="sw-prev" onClick={() => setCurrentStep(p => p - 1)}>上一步</button>}
        <button className={`sw-next ${!canNext() ? 'disabled' : ''}`} onClick={handleNext} disabled={!canNext()}>
          {isLastStep ? (data.submitLabel || '确认提交') : '下一步'}
        </button>
      </div>
    </div>
  );
}
