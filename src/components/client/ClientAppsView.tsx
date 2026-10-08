import React from 'react';
import { Customer } from '../../types';

export const ClientAppsView: React.FC<{ customer: Customer }> = () => {
  return (
    <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-100 space-y-4">
      <h3 className="text-sm font-bold">Aplicativos & Tutoriais</h3>
      <p className="text-xs text-zinc-400">Baixe os aplicativos oficiais e configure sua Smart TV ou celular.</p>
    </div>
  );
};
