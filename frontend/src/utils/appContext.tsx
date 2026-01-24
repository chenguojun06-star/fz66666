import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { message } from 'antd';

// 定义消息类型
type MessageType = 'success' | 'error' | 'warning' | 'info';

// 定义应用状态类型
interface AppState {
  isLoading: boolean;
  message: {
    type: MessageType;
    content: string;
    visible: boolean;
  };
}

// 定义上下文类型
interface AppContextType extends AppState {
  setLoading: (loading: boolean) => void;
  showMessage: (type: MessageType, content: string) => void;
  hideMessage: () => void;
}

// 创建上下文
const AppContext = createContext<AppContextType | undefined>(undefined);

// 上下文提供者组件
interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  // 应用状态
  const [state, setState] = useState<AppState>({
    isLoading: false,
    message: {
      type: 'info',
      content: '',
      visible: false
    }
  });

  // 设置加载状态
  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  }, []);

  // 隐藏消息
  const hideMessage = useCallback(() => {
    setState(prev => ({
      ...prev,
      message: {
        ...prev.message,
        visible: false
      }
    }));
  }, []);

  // 显示消息
  const showMessage = useCallback((type: MessageType, content: string) => {
    // 使用Ant Design的message组件显示消息
    message[type](content);
    // 更新状态（可选，用于自定义消息组件）
    setState(prev => ({
      ...prev,
      message: {
        type,
        content,
        visible: true
      }
    }));
    // 3秒后自动隐藏
    setTimeout(() => {
      hideMessage();
    }, 3000);
  }, [hideMessage]);

  return (
    <AppContext.Provider
      value={{
        ...state,
        setLoading,
        showMessage,
        hideMessage
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

// 自定义钩子，方便组件使用上下文
export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('必须在应用上下文提供者内部使用该钩子');
  }
  return context;
};
