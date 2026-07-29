import { useEffect, useState } from "react";
import { XIcon, UsersIcon, CheckIcon } from "lucide-react";
import { useChatStore } from "../store/useChatStore.js";

function CreateGroupModal({ onClose }) {
  const { allContacts, getAllContacts, createGroup, setSelectedGroup } = useChatStore();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState({}); // { userId: true }
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (allContacts.length === 0) getAllContacts();
  }, [allContacts.length, getAllContacts]);

  const toggle = (id) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });

  const memberIds = Object.keys(selected);

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (memberIds.length < 1) return;
    setSubmitting(true);
    const group = await createGroup({ name: name.trim(), memberIds });
    setSubmitting(false);
    if (group) {
      setSelectedGroup(group);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-100 font-semibold flex items-center gap-2">
            <UsersIcon className="size-5 text-cyan-400" /> New Group
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <XIcon className="size-5" />
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name"
          className="w-full bg-slate-900/60 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 mb-3"
        />

        <p className="text-slate-400 text-xs mb-2">
          Select members ({memberIds.length} chosen)
        </p>
        <div className="max-h-60 overflow-y-auto space-y-1 mb-4">
          {allContacts.length === 0 && (
            <p className="text-slate-500 text-sm">No contacts found.</p>
          )}
          {allContacts.map((u) => {
            const on = !!selected[u._id];
            return (
              <button
                key={u._id}
                onClick={() => toggle(u._id)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                  on ? "bg-cyan-500/20" : "hover:bg-slate-700/50"
                }`}
              >
                <div className="size-9 rounded-full overflow-hidden shrink-0">
                  <img src={u.profilePic || "/avatar.png"} alt={u.fullName} />
                </div>
                <span className="text-slate-200 text-sm truncate flex-1 text-left">
                  {u.fullName}
                </span>
                {on && <CheckIcon className="size-4 text-cyan-400" />}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-700/50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={submitting || !name.trim() || memberIds.length < 1}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-medium hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateGroupModal;
