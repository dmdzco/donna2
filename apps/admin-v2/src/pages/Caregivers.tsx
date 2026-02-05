import { useState, useEffect } from 'react';
import { api, type CaregiverLink } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function Caregivers() {
  const [links, setLinks] = useState<CaregiverLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.caregivers.list()
      .then(setLinks)
      .catch((e) => console.error('Failed to load caregivers', e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded-xl p-5 mb-5 shadow-card">
      <h2 className="text-base font-bold text-admin-text-light border-b-2 border-admin-primary pb-2 mb-4">
        Caregiver-Senior Links
      </h2>

      {loading ? (
        <p className="text-center py-10 text-admin-text-muted">Loading...</p>
      ) : !links.length ? (
        <p className="text-center py-10 text-admin-text-muted">No caregiver links yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-100">
                <th className="text-left p-2 font-semibold text-admin-text-light">Clerk User ID</th>
                <th className="text-left p-2 font-semibold text-admin-text-light">Senior</th>
                <th className="text-left p-2 font-semibold text-admin-text-light">Role</th>
                <th className="text-left p-2 font-semibold text-admin-text-light">Added</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="p-2 font-mono text-[11px] text-admin-text-light">{l.clerkUserId}</td>
                  <td className="p-2">{l.seniorName || l.seniorId}</td>
                  <td className="p-2">
                    <span className="inline-block bg-admin-tag text-admin-primary px-2 py-0.5 rounded-full text-[11px]">
                      {l.role}
                    </span>
                  </td>
                  <td className="p-2 text-admin-text-muted">{formatDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
