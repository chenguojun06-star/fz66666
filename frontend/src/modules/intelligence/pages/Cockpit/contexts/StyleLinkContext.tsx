import React, { createContext, useContext, useCallback, ReactNode, useRef, useMemo } from 'react';

interface StyleLinkData {
  styleNo: string;
  styleName: string;
  moduleKey: string;
  position: { x: number; y: number; width: number; height: number };
}

interface StyleLinkContextType {
  registerStyle: (moduleKey: string, styles: Array<{ styleNo: string; styleName?: string }>, position: { x: number; y: number; width: number; height: number }) => void;
  unregisterModule: (moduleKey: string) => void;
  updateModulePosition: (moduleKey: string, position: { x: number; y: number; width: number; height: number }) => void;
  getLinkedStyles: () => Map<string, StyleLinkData[]>;
}

const StyleLinkContext = createContext<StyleLinkContextType | null>(null);

export const useStyleLink = () => {
  const context = useContext(StyleLinkContext);
  if (!context) {
    return null;
  }
  return context;
};

interface StyleLinkProviderProps {
  children: ReactNode;
}

export const StyleLinkProvider: React.FC<StyleLinkProviderProps> = ({ children }) => {
  const styleDataRef = useRef<Map<string, StyleLinkData[]>>(new Map());
  const listenersRef = useRef<Set<() => void>>(new Set());

  const notifyListeners = useCallback(() => {
    listenersRef.current.forEach(listener => listener());
  }, []);

  const registerStyle = useCallback((
    moduleKey: string, 
    styles: Array<{ styleNo: string; styleName?: string }>, 
    position: { x: number; y: number; width: number; height: number }
  ) => {
    const uniqueStyles = [...new Map(styles.map(s => [s.styleNo, s])).values()];
    
    const linkData: StyleLinkData[] = uniqueStyles.map(s => ({
      styleNo: s.styleNo,
      styleName: s.styleName || s.styleNo,
      moduleKey,
      position,
    }));
    
    styleDataRef.current.set(moduleKey, linkData);
    notifyListeners();
  }, [notifyListeners]);

  const unregisterModule = useCallback((moduleKey: string) => {
    styleDataRef.current.delete(moduleKey);
    notifyListeners();
  }, [notifyListeners]);

  const updateModulePosition = useCallback((
    moduleKey: string, 
    position: { x: number; y: number; width: number; height: number }
  ) => {
    const existingData = styleDataRef.current.get(moduleKey);
    if (existingData) {
      const updatedData = existingData.map(d => ({ ...d, position }));
      styleDataRef.current.set(moduleKey, updatedData);
      notifyListeners();
    }
  }, [notifyListeners]);

  const getLinkedStyles = useCallback(() => {
    const styleMap = new Map<string, StyleLinkData[]>();
    
    styleDataRef.current.forEach(moduleStyles => {
      moduleStyles.forEach(styleData => {
        const existing = styleMap.get(styleData.styleNo) || [];
        const alreadyAdded = existing.some(e => e.moduleKey === styleData.moduleKey);
        if (!alreadyAdded) {
          existing.push(styleData);
          styleMap.set(styleData.styleNo, existing);
        }
      });
    });

    const linkedOnly = new Map<string, StyleLinkData[]>();
    styleMap.forEach((data, styleNo) => {
      if (data.length >= 2) {
        linkedOnly.set(styleNo, data);
      }
    });

    return linkedOnly;
  }, []);

  const contextValue = useMemo(() => ({
    registerStyle,
    unregisterModule,
    updateModulePosition,
    getLinkedStyles,
  }), [registerStyle, unregisterModule, updateModulePosition, getLinkedStyles]);

  return (
    <StyleLinkContext.Provider value={contextValue}>
      {children}
    </StyleLinkContext.Provider>
  );
};

export type { StyleLinkData };
