import React from 'react';

interface OnlineStatusProps {
  isOnline: boolean;
  className?: string;
}

const OnlineStatus: React.FC<OnlineStatusProps> = ({ isOnline, className = '' }) => {
  if (!isOnline) return null;
  
  return (
    <span className={`online-dot ${className}`} title="Онлайн"></span>
  );
};

export default OnlineStatus;