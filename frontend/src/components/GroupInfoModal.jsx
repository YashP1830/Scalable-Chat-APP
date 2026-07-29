import { useEffect, useState } from "react";
import { XIcon, UsersIcon, ShieldIcon, PlusIcon } from "lucide-react";
import { useChatStore } from "../store/useChatStore.js";
import { useAuthStore } from "../store/useAuth.stores.js";

function GroupInfoModal({ onClose }) {
  const { selectedUser, allContacts, getAllContacts, addGroupMember } = useChatStore();
  const { authUser } = useAuthStore();
  const [addingId, setAddingId] = useState(null);

  const group = selectedUser; // a group object with isGroup:true
  const members = group?.members || [];
  const isAdmin = group?.admin === authUser?._id;

  useEffect(() => {
    if (allContacts.length === 0) getAllContacts();
  }, [allContacts.length, getAllContacts]);

  const memberIdSet = new Set(members.map((m) => m._id));
  const addable = allContacts.filter((u) => !memberIdSet.has(u._id));

  const handleAdd = async (memberId) => {
    setAddingId(memberId);
    await addGroupMember(group._id, memberId);
    setAddingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-100 font-semibold flex items-center gap-2">
            <UsersIcon className="size-5 text-fuchsia-300" /> {group?.name}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <XIcon className="size-5" />
          </button>
        </div>

        {/* Current members */}
        <p className="text-slate-400 text-xs mb-2">Members ({members.length})</p>
        <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
          {members.map((m) => (
            <div key={m._id} className="flex items-center gap-3 p-2 rounded-lg">
              <div className="size-9 rounded-full overflow-hidden shrink-0">
                <img src={m.profilePic || "/avatar.png"} alt={m.fullName} />
              </div>
              <span className="text-slate-200 text-sm truncate flex-1">
                {m.fullName}
                {m._id === authUser?._id && " (you)"}
              </span>
              {group?.admin === m._id && (
                <span className="flex items-center gap-1 text-amber-300 text-xs">
                  <ShieldIcon className="size-3.5" /> admin
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Add members — admin only */}
        {isAdmin ? (
          <>
            <p className="text-slate-400 text-xs mb-2">Add members</p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {addable.length === 0 && (
                <p className="text-slate-500 text-sm">Everyone you know is already in.</p>
              )}
              {addable.map((u) => (
                <div key={u._id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/40">
                  <div className="size-9 rounded-full overflow-hidden shrink-0">
                    <img src={u.profilePic || "/avatar.png"} alt={u.fullName} />
                  </div>
                  <span className="text-slate-200 text-sm truncate flex-1">{u.fullName}</span>
                  <button
                    onClick={() => handleAdd(u._id)}
                    disabled={addingId === u._id}
                    className="flex items-center gap-1 text-cyan-300 hover:text-cyan-200 text-sm disabled:opacity-50"
                  >
                    <PlusIcon className="size-4" />
                    {addingId === u._id ? "Adding…" : "Add"}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-slate-500 text-xs">Only the admin can add members.</p>
        )}
      </div>
    </div>
  );
}

export default GroupInfoModal;
