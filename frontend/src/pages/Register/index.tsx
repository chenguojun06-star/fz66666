import React from 'react';
import '../Login/styles.css';
import { useRegister } from './useRegister';
import RegisterLeftPane from './RegisterLeftPane';
import RegisterRightPane from './RegisterRightPane';

const Register: React.FC = () => {
  const {
    form,
    submitting,
    navigate,
    message,
    isWorkerInvite,
    isFactoryInvite,
    factoryName,
    belongLabel,
    year,
    buildCommit,
    buildTimeText,
    handleSubmit,
  } = useRegister();

  return (
    <div className="login-page modern-login-page">
      <RegisterLeftPane
        isWorkerInvite={isWorkerInvite}
        isFactoryInvite={isFactoryInvite}
        factoryName={factoryName}
      />
      <RegisterRightPane
        form={form}
        submitting={submitting}
        isWorkerInvite={isWorkerInvite}
        isFactoryInvite={isFactoryInvite}
        factoryName={factoryName}
        belongLabel={belongLabel}
        year={year}
        buildCommit={buildCommit}
        buildTimeText={buildTimeText}
        handleSubmit={handleSubmit}
        navigate={navigate}
        message={message}
      />
    </div>
  );
};

export default Register;
