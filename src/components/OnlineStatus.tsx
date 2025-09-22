import React from 'react';

interface OnlineStatusProps {
  isOnline: boolean;
  className?: string;
}

const OnlineStatus: React.FC<OnlineStatusProps> = ({ isOnline, className = '' }) => {
  return (
    <span 
      className={`inline-block w-2 h-2 rounded-full mr-1 flex-shrink-0 ${
        isOnline 
          ? 'bg-green-500 shadow-sm' 
          : 'bg-gray-400'
      } ${className}`} 
      title={isOnline ? "Онлайн" : "Офлайн"}
    />
  );
};

export default OnlineStatus;