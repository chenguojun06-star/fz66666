import React from 'react';
import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { paths } from '../routeConfig';

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Result
      status="404"
      title="页面未找到"
      subTitle="您访问的页面不存在或已被移除"
      extra={(
        <Button type="primary" onClick={() => navigate(paths.dashboard)}>
          返回首页
        </Button>
      )}
    />
  );
};

export default NotFound;
