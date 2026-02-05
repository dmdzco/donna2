import { useEffect, useState } from 'react';
import { Phone, Edit2, Trash2, Plus, X } from 'lucide-react';
import {
  api,
  type Senior,
  type Memory,
  type CreateSeniorInput,
} from '@/lib/api';

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-5 right-5 px-4 py-3 rounded-lg text-white shadow-lg z-50 ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
      }`}
    >
      {message}
    </div>
  );
}

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl p-6 w-full max-w-xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Seniors() {
  const [seniors, setSeniors] = useState<Senior[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateSeniorInput>({
    name: '',
    phone: '',
    interests: [],
    familyInfo: { location: '' },
    medicalNotes: '',
  });
  const [interestsInput, setInterestsInput] = useState('');

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSenior, setEditingSenior] = useState<Senior | null>(null);
  const [editMemories, setEditMemories] = useState<Memory[]>([]);
  const [newMemory, setNewMemory] = useState({ type: 'fact' as Memory['type'], content: '' });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const loadSeniors = async () => {
    try {
      const data = await api.seniors.list();
      // Load memories for each senior
      const seniorsWithMemories = await Promise.all(
        data.map(async (senior) => {
          try {
            const memories = await api.memories.list(senior.id);
            return { ...senior, memories: memories.slice(0, 5) };
          } catch {
            return { ...senior, memories: [] };
          }
        })
      );
      setSeniors(seniorsWithMemories);
    } catch (error) {
      showToast('Failed to load seniors', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSeniors();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.seniors.create({
        ...formData,
        interests: interestsInput.split(',').map((i) => i.trim()).filter(Boolean),
      });
      showToast('Senior added!', 'success');
      setFormData({
        name: '',
        phone: '',
        interests: [],
        familyInfo: { location: '' },
        medicalNotes: '',
      });
      setInterestsInput('');
      loadSeniors();
    } catch (error) {
      showToast('Failed to add senior', 'error');
    }
  };

  const handleCall = async (phone: string, name: string) => {
    if (!confirm(`Call ${name}?`)) return;
    try {
      await api.calls.initiate(phone);
      showToast(`Calling ${name}...`, 'success');
    } catch (error) {
      showToast('Failed to call', 'error');
    }
  };

  const handleEdit = async (senior: Senior) => {
    setEditingSenior(senior);
    try {
      const memories = await api.memories.list(senior.id);
      setEditMemories(memories);
    } catch {
      setEditMemories([]);
    }
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSenior) return;

    try {
      await api.seniors.update(editingSenior.id, editingSenior);
      showToast('Senior updated!', 'success');
      setEditModalOpen(false);
      loadSeniors();
    } catch (error) {
      showToast('Failed to update', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this senior?')) return;
    try {
      await api.seniors.delete(id);
      showToast('Senior deleted', 'success');
      loadSeniors();
    } catch (error) {
      showToast('Failed to delete', 'error');
    }
  };

  const handleAddMemory = async () => {
    if (!editingSenior || !newMemory.content.trim()) {
      showToast('Enter memory content', 'error');
      return;
    }
    try {
      await api.memories.create(editingSenior.id, {
        type: newMemory.type,
        content: newMemory.content,
        importance: 70,
      });
      const memories = await api.memories.list(editingSenior.id);
      setEditMemories(memories);
      setNewMemory({ type: 'fact', content: '' });
      showToast('Memory added!', 'success');
    } catch (error) {
      showToast('Failed to add memory', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Add Senior Form */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 border-b-2 border-indigo-500 pb-2 mb-4">
          Add New Senior
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Margaret Johnson"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone *
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="e.g., +1 555 123 4567"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <input
                type="text"
                value={formData.familyInfo?.location || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    familyInfo: { ...formData.familyInfo, location: e.target.value },
                  })
                }
                placeholder="e.g., Miami, FL"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Interests
              </label>
              <input
                type="text"
                value={interestsInput}
                onChange={(e) => setInterestsInput(e.target.value)}
                placeholder="gardening, baking, puzzles"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Comma-separated</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Medical Notes
            </label>
            <textarea
              value={formData.medicalNotes || ''}
              onChange={(e) =>
                setFormData({ ...formData, medicalNotes: e.target.value })
              }
              placeholder="Any health information..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:shadow-lg transition-shadow"
          >
            <Plus className="w-4 h-4" />
            Add Senior
          </button>
        </form>
      </div>

      {/* Seniors List */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 border-b-2 border-indigo-500 pb-2 mb-4">
          Seniors
        </h2>
        {!seniors.length ? (
          <p className="text-gray-500 text-center py-8">No seniors yet</p>
        ) : (
          <div className="space-y-3">
            {seniors.map((senior) => (
              <div
                key={senior.id}
                className="flex justify-between items-start p-4 bg-gray-50 rounded-lg border border-gray-100"
              >
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{senior.name}</h3>
                  <p className="text-sm text-gray-600">{senior.phone}</p>
                  {senior.familyInfo?.location && (
                    <p className="text-xs text-gray-500">
                      {senior.familyInfo.location}
                    </p>
                  )}
                  {senior.interests && senior.interests.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {senior.interests.map((interest, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  )}
                  {senior.memories && senior.memories.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                      <p className="text-xs text-gray-500 uppercase mb-2">
                        Memories
                      </p>
                      <div className="space-y-1">
                        {senior.memories.map((memory) => (
                          <div
                            key={memory.id}
                            className="text-xs bg-indigo-50 border border-indigo-100 rounded px-2 py-1"
                          >
                            <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-[10px] font-medium uppercase mr-2">
                              {memory.type}
                            </span>
                            {memory.content}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleCall(senior.phone, senior.name)}
                    className="p-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:shadow-md transition-shadow"
                    title="Call"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEdit(senior)}
                    className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(senior.id)}
                    className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Senior"
      >
        {editingSenior && (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={editingSenior.name}
                  onChange={(e) =>
                    setEditingSenior({ ...editingSenior, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone *
                </label>
                <input
                  type="tel"
                  required
                  value={editingSenior.phone}
                  onChange={(e) =>
                    setEditingSenior({ ...editingSenior, phone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={editingSenior.familyInfo?.location || ''}
                  onChange={(e) =>
                    setEditingSenior({
                      ...editingSenior,
                      familyInfo: {
                        ...editingSenior.familyInfo,
                        location: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Interests
                </label>
                <input
                  type="text"
                  value={editingSenior.interests?.join(', ') || ''}
                  onChange={(e) =>
                    setEditingSenior({
                      ...editingSenior,
                      interests: e.target.value
                        .split(',')
                        .map((i) => i.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Medical Notes
              </label>
              <textarea
                value={editingSenior.medicalNotes || ''}
                onChange={(e) =>
                  setEditingSenior({
                    ...editingSenior,
                    medicalNotes: e.target.value,
                  })
                }
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Memories Section */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-indigo-600 mb-3">
                Memories
              </h3>
              <div className="flex gap-2 mb-3">
                <select
                  value={newMemory.type}
                  onChange={(e) =>
                    setNewMemory({
                      ...newMemory,
                      type: e.target.value as Memory['type'],
                    })
                  }
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="fact">Fact</option>
                  <option value="preference">Preference</option>
                  <option value="event">Event</option>
                  <option value="concern">Concern</option>
                  <option value="relationship">Relationship</option>
                </select>
                <input
                  type="text"
                  placeholder="e.g., Has a grandson named Tommy"
                  value={newMemory.content}
                  onChange={(e) =>
                    setNewMemory({ ...newMemory, content: e.target.value })
                  }
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddMemory}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                >
                  Add
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {!editMemories.length ? (
                  <p className="text-xs text-gray-500">No memories yet</p>
                ) : (
                  editMemories.map((m) => (
                    <div
                      key={m.id}
                      className="text-xs bg-indigo-50 border border-indigo-100 rounded px-2 py-1"
                    >
                      <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-[10px] font-medium uppercase mr-2">
                        {m.type}
                      </span>
                      {m.content}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:shadow-lg"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
