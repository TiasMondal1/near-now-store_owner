import React, { createContext, useContext, useState } from 'react';

const IncomingOrdersContext = createContext<{
  incomingCount: number;
  setIncomingCount: (n: number) => void;
}>({ incomingCount: 0, setIncomingCount: () => {} });

export function IncomingOrdersProvider({ children }: { children: React.ReactNode }) {
  const [incomingCount, setIncomingCount] = useState(0);
  return (
    <IncomingOrdersContext.Provider value={{ incomingCount, setIncomingCount }}>
      {children}
    </IncomingOrdersContext.Provider>
  );
}

export function useIncomingOrdersCount() {
  return useContext(IncomingOrdersContext);
}
