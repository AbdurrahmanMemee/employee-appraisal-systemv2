// =============================================================================
// FILE:    src/pages/Placeholder.jsx
// PURPOSE: Temporary placeholder shown for pages not yet built.
//          Replace each one with the real module page as we build them.
// =============================================================================

import React from 'react';
import { Construction } from 'lucide-react';
import { Card } from '../components/ui';

const Placeholder = ({ title }) => (
  <Card>
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Construction className="w-12 h-12 text-yellow-500 mb-4" />
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-500 text-sm max-w-sm">
        This module is coming in the next phase. The backend API for this
        section is fully built and tested — only the UI remains.
      </p>
    </div>
  </Card>
);

export const DashboardPage    = () => <Placeholder title="Dashboard" />;
export const EmployeesPage    = () => <Placeholder title="Employees" />;
export const SchedulesPage    = () => <Placeholder title="Schedule" />;
export const IncidentsPage    = () => <Placeholder title="Incidents" />;
export const ConfigPage       = () => <Placeholder title="Configuration" />;
