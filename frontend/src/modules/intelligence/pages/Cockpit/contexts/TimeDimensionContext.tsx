import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type TimeDimension = 'day' | 'week' | 'month' | 'year';

interface TimeDimensionContextType {
  dimension: TimeDimension;
  setDimension: (dim: TimeDimension) => void;
  getDateRange: () => { start: Date; end: Date };
}

const TimeDimensionContext = createContext<TimeDimensionContextType | null>(null);

export const useTimeDimension = () => {
  const context = useContext(TimeDimensionContext);
  if (!context) {
    throw new Error('useTimeDimension must be used within TimeDimensionProvider');
  }
  return context;
};

interface TimeDimensionProviderProps {
  children: ReactNode;
}

export const TimeDimensionProvider: React.FC<TimeDimensionProviderProps> = ({ children }) => {
  const [dimension, setDimension] = useState<TimeDimension>('month');

  const getDateRange = useCallback(() => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    let start = new Date(now);
    start.setHours(0, 0, 0, 0);

    switch (dimension) {
      case 'day':
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        break;
    }

    return { start, end };
  }, [dimension]);

  return (
    <TimeDimensionContext.Provider value={{ dimension, setDimension, getDateRange }}>
      {children}
    </TimeDimensionContext.Provider>
  );
};

export type { TimeDimension };
