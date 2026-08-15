import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { useAuthStore } from '../stores/authStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { can } from '../utils/permissions';

export const DashboardScreen: React.FC = () => {
  const navigate = useNavigate();
  const { cases, loadCases, setActiveCase, addCase, archiveCase, importCase, caseAssignments, assignableFieldOperators, loadCaseAssignments, loadAssignableFieldOperators, assignFieldOperator, removeFieldAssignment, fieldTasks, loadFieldTasks, createFieldTask, completeFieldTask } = useCaseStore();
  const { setIntentionalBackground, currentUser } = useAuthStore(); // 🚀 NEW: Import Intentional Background trigger
  const canCreateCase = can(currentUser?.role, 'case:create');
  const canImportCase = can(currentUser?.role, 'case:import');
  const canArchiveCase = can(currentUser?.role, 'case:archive');
  const canAssignCase = can(currentUser?.role, 'case:assign');
  const isFieldOperator = currentUser?.role === 'field';
  
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRef, setNewRef] = useState('');
  const [newClass, setNewClass] = useState('OFFICIAL');
  const [assignmentCaseId, setAssignmentCaseId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [assignmentNote, setAssignmentNote] = useState('');
  const [removalReason, setRemovalReason] = useState('');
  const [assignmentMsg, setAssignmentMsg] = useState('');
  const [taskCaseId, setTaskCaseId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskObjective, setTaskObjective] = useState('');
  const [taskChecklist, setTaskChecklist] = useState('');
  const [taskContext, setTaskContext] = useState('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [taskCompletionNote, setTaskCompletionNote] = useState('');

  useEffect(() => { loadCases(); }, [loadCases]);
  useEffect(() => {
    if (canAssignCase) loadAssignableFieldOperators().catch((error) => setAssignmentMsg(error instanceof Error ? error.message : 'Field operator registry is unavailable.'));
  }, [canAssignCase, loadAssignableFieldOperators]);

  const filteredCases = cases.filter(c => c.status === activeTab);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newRef.trim()) return;
    try {
      await addCase(newTitle, newRef, 'operation', newClass);
      setIsModalOpen(false); setNewTitle(''); setNewRef(''); setActiveTab('active');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'The case could not be created.');
    }
  };

  const handleOpenCase = (id: string) => {
    setActiveCase(id); navigate('/workspace');
  };

  const handleOpenAssignments = (caseId: string) => {
    setAssignmentCaseId(caseId);
    setAssigneeId('');
    setAssignmentNote('');
    setRemovalReason('');
    setAssignmentMsg('');
    loadCaseAssignments(caseId).catch((error) => setAssignmentMsg(error instanceof Error ? error.message : 'Assignments could not be loaded.'));
    loadFieldTasks(caseId).catch((error) => setAssignmentMsg(error instanceof Error ? error.message : 'Field tasks could not be loaded.'));
  };

  const handleAssignFieldOperator = async () => {
    if (!assignmentCaseId || !assigneeId) return;
    try {
      await assignFieldOperator(assignmentCaseId, assigneeId, assignmentNote);
      setAssigneeId('');
      setAssignmentNote('');
      setAssignmentMsg('Field operator assigned to this operation.');
    } catch (error) {
      setAssignmentMsg(error instanceof Error ? error.message : 'Assignment could not be recorded.');
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      await removeFieldAssignment(assignmentId, removalReason);
      setRemovalReason('');
      setAssignmentMsg('Field assignment removed.');
    } catch (error) {
      setAssignmentMsg(error instanceof Error ? error.message : 'Assignment could not be removed.');
    }
  };

  const handleCreateFieldTask = async () => {
    if (!assignmentCaseId || !assigneeId) return;
    try {
      await createFieldTask(assignmentCaseId, assigneeId, taskTitle, taskObjective, taskChecklist.split('\n'), taskContext, taskDueAt);
      setTaskTitle(''); setTaskObjective(''); setTaskChecklist(''); setTaskContext(''); setTaskDueAt('');
      setAssignmentMsg('Structured field task created and added to the local work queue.');
    } catch (error) {
      setAssignmentMsg(error instanceof Error ? error.message : 'Field task could not be created.');
    }
  };

  const handleOpenTasks = (caseId: string) => {
    setTaskCaseId(caseId);
    setTaskCompletionNote('');
    loadFieldTasks(caseId).catch((error) => setAssignmentMsg(error instanceof Error ? error.message : 'Field tasks could not be loaded.'));
  };

  const handleCompleteTask = async (taskId: string, status: 'complete' | 'unable') => {
    try {
      await completeFieldTask(taskId, status, taskCompletionNote);
      setTaskCompletionNote('');
      setAssignmentMsg(status === 'complete' ? 'Task completion submitted for handoff.' : 'Unable-to-complete reason recorded for handoff.');
    } catch (error) {
      setAssignmentMsg(error instanceof Error ? error.message : 'Task state could not be updated.');
    }
  };

  const handleImport = async () => {
    // 🚀 FIX: Tell the app we are intentionally opening the OS File Picker!
    setIntentionalBackground(true); 
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.enc';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) {
        setIntentionalBackground(false); // Reset if they cancel the picker
        return; 
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result;
        if (typeof text === 'string') {
          try {
            await importCase(text);
          } catch (err) {
            alert("Import failed. Incorrect password or corrupted package.");
          }
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="h-screen w-full bg-[#0c0e14] text-[#dde1ec] flex flex-col pt-safe pb-safe-nav relative">
      <div className="p-4 bg-[#14171f] border-b border-[#252a3a] flex justify-between items-center z-10 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-white uppercase">Operations</h1>
          <p className="text-xs text-[#7880a0]">{isFieldOperator ? 'Field capture mode: select an existing operation' : 'Select a database to load'}</p>
        </div>
        <div className="flex space-x-2">
          <button onClick={handleImport} disabled={!canImportCase} title={!canImportCase ? 'Case imports require an analyst, supervisor, or administrator account.' : 'Import an encrypted case package.'} className="px-3 py-2 bg-[#252a3a] text-[#dde1ec] text-xs font-bold rounded uppercase hover:bg-[#3a415c] disabled:opacity-40">Import</button>
          <button onClick={() => setIsModalOpen(true)} disabled={!canCreateCase} title={!canCreateCase ? 'Case creation requires an analyst, supervisor, or administrator account.' : 'Create an operation.'} className="px-3 py-2 bg-[#3a7bd5] text-white text-xs font-bold rounded uppercase shadow-[0_0_10px_rgba(58,123,213,0.3)] hover:bg-[#4a8be5] disabled:opacity-40">+ New</button>
        </div>
      </div>

      {isFieldOperator && (
        <aside role="status" className="mx-4 mt-4 rounded-lg border border-[#3a7bd5]/40 bg-[#3a7bd5]/10 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#72a7f0]">Field workflow</p>
          <p className="mt-1 text-xs leading-relaxed text-[#dde1ec]">Select an existing local operation, open its graph, then capture observations and evidence. An analyst, supervisor, or administrator must create or import the operation first.</p>
        </aside>
      )}

      <div className="flex border-b border-[#252a3a] bg-[#14171f] shrink-0">
        <button onClick={() => setActiveTab('active')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'active' ? 'text-[#3a7bd5] border-b-2 border-[#3a7bd5]' : 'text-[#7880a0] hover:text-[#dde1ec]'}`}>Active</button>
        <button onClick={() => setActiveTab('archived')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'archived' ? 'text-[#e74c3c] border-b-2 border-[#e74c3c]' : 'text-[#7880a0] hover:text-[#dde1ec]'}`}>Archived</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-[#7880a0]"><p className="text-sm">{isFieldOperator && activeTab === 'active' ? 'No local operations are available for field capture.' : `No ${activeTab} operations found.`}</p>{isFieldOperator && activeTab === 'active' && <p className="mt-2 max-w-sm text-xs leading-relaxed">Ask an analyst, supervisor, or administrator to create or import the operation on this device. Once it appears here, select it to open the graph and record intelligence.</p>}</div>
        ) : (
          filteredCases.map((c) => (
            <div key={c.id} className="bg-[#1c2030] border border-[#252a3a] rounded-lg p-4 flex flex-col cursor-pointer hover:border-[#3a7bd5] transition-colors" onClick={() => handleOpenCase(c.id)}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] text-[#3a7bd5] font-mono tracking-widest">{c.reference_number}</span>
                <div className="flex items-center gap-2"><span className="text-[9px] px-2 py-1 bg-[#252a3a] text-[#dde1ec] font-bold rounded uppercase">{c.classification}</span>{canAssignCase && c.status === 'active' && <button onClick={(event) => { event.stopPropagation(); handleOpenAssignments(c.id); }} className="text-[9px] px-2 py-1 rounded border border-[#b893e6]/70 text-[#d8c8ff] font-bold uppercase">Assign field</button>}</div>
              </div>
              <h2 className="text-lg font-bold text-white mb-2 line-clamp-1">{c.title}</h2>
              {isFieldOperator && <p className="mb-3 text-[10px] leading-relaxed text-[#72a7f0]">{c.assignment_note || 'Assigned for field capture. Record observations and evidence for supervisory review.'}</p>}
              <div className="flex justify-between items-end border-t border-[#252a3a] pt-3">
                <span className="text-[10px] text-[#7880a0] uppercase tracking-widest">{new Date(c.date_opened).toLocaleDateString()}</span>
                <div className="flex items-center gap-3">{isFieldOperator && activeTab === 'active' && <button onClick={(event) => { event.stopPropagation(); handleOpenTasks(c.id); }} className="text-[10px] font-bold uppercase text-[#72a7f0] hover:underline">Tasks</button>}{activeTab === 'active' && <button onClick={(e) => { e.stopPropagation(); archiveCase(c.id).catch((error) => alert(error instanceof Error ? error.message : 'Unable to archive case.')); }} disabled={!canArchiveCase} className="text-[10px] text-[#e74c3c] font-bold uppercase hover:underline disabled:opacity-40">Archive</button>}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {assignmentCaseId && (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-end sm:items-center justify-center p-4">
          <section role="dialog" aria-modal="true" aria-label="Manage field assignments" className="w-full max-w-md max-h-[80vh] overflow-y-auto bg-[#14171f] border border-[#b893e6] rounded-lg p-5 shadow-2xl">
            <div className="flex justify-between gap-3 border-b border-[#252a3a] pb-3 mb-4"><div><h2 className="text-sm font-bold text-[#d8c8ff] uppercase tracking-widest">Field work queue</h2><p className="mt-1 text-[10px] text-[#7880a0]">Assignments are local to this encrypted device and do not transfer intelligence.</p></div><button onClick={() => setAssignmentCaseId(null)} className="text-xs font-bold text-[#7880a0] uppercase">Close</button></div>
            <div className="space-y-3">
              <label className="block text-[10px] font-bold uppercase text-[#7880a0]">Active field operator
                <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="mt-1 w-full bg-[#0c0e14] border border-[#454d66] rounded p-3 text-xs text-white focus:border-[#b893e6] focus:outline-none"><option value="">Select operator</option>{assignableFieldOperators.map((operator) => <option key={operator.id} value={operator.id}>{operator.badge} · {operator.name}</option>)}</select>
              </label>
              <label className="block text-[10px] font-bold uppercase text-[#7880a0]">Assignment note <span className="normal-case font-normal">(optional)</span>
                <textarea value={assignmentNote} onChange={(event) => setAssignmentNote(event.target.value)} maxLength={500} placeholder="Tasking or safety context for the field operator" className="mt-1 w-full min-h-20 bg-[#0c0e14] border border-[#454d66] rounded p-3 text-xs text-white focus:border-[#b893e6] focus:outline-none" />
              </label>
              <button onClick={handleAssignFieldOperator} disabled={!assigneeId} className="w-full py-3 rounded bg-[#b893e6] text-[#0c0e14] text-xs font-bold uppercase disabled:opacity-40">Assign to operation</button>
            </div>
            <section className="mt-5 border-t border-[#252a3a] pt-4 space-y-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-[#d8c8ff]">Structured field task</p><p className="mt-1 text-[10px] text-[#7880a0]">Task cards appear only in the selected operator’s local work queue. They do not transfer data between devices.</p></div><input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={160} placeholder="Task title" className="w-full bg-[#0c0e14] border border-[#454d66] rounded p-3 text-xs text-white focus:border-[#b893e6] focus:outline-none" /><textarea value={taskObjective} onChange={(event) => setTaskObjective(event.target.value)} maxLength={1000} placeholder="Objective and required outcome" className="w-full min-h-20 bg-[#0c0e14] border border-[#454d66] rounded p-3 text-xs text-white focus:border-[#b893e6] focus:outline-none" /><textarea value={taskChecklist} onChange={(event) => setTaskChecklist(event.target.value)} maxLength={3000} placeholder="Checklist items, one per line (optional)" className="w-full min-h-20 bg-[#0c0e14] border border-[#454d66] rounded p-3 text-xs text-white focus:border-[#b893e6] focus:outline-none" /><textarea value={taskContext} onChange={(event) => setTaskContext(event.target.value)} maxLength={1000} placeholder="Context or safety note (optional)" className="w-full min-h-16 bg-[#0c0e14] border border-[#454d66] rounded p-3 text-xs text-white focus:border-[#b893e6] focus:outline-none" /><label className="block text-[10px] font-bold uppercase text-[#7880a0]">Due window <span className="normal-case font-normal">(optional)</span><input type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} className="mt-1 w-full bg-[#0c0e14] border border-[#454d66] rounded p-3 text-xs text-white focus:border-[#b893e6] focus:outline-none" /></label><button onClick={handleCreateFieldTask} disabled={!assigneeId || taskTitle.trim().length < 3 || taskObjective.trim().length < 5} className="w-full py-3 rounded border border-[#b893e6] text-[#d8c8ff] text-xs font-bold uppercase disabled:opacity-40">Create field task</button></section>
            <div className="mt-5 border-t border-[#252a3a] pt-4 space-y-2"><p className="text-[10px] font-bold uppercase tracking-widest text-[#7880a0]">Current and historic assignments</p>{caseAssignments.length === 0 && <p className="text-xs text-[#7880a0]">No field assignments are recorded for this operation.</p>}{caseAssignments.map((assignment) => <article key={assignment.id} className="rounded border border-[#252a3a] bg-[#0c0e14] p-3"><div className="flex justify-between gap-3"><div><p className="text-xs font-mono font-bold text-[#dde1ec]">{assignment.operatorBadge}</p><p className="mt-1 text-[10px] text-[#7880a0]">{assignment.operatorName} · {assignment.status}</p></div><span className={`text-[9px] font-bold uppercase ${assignment.status === 'active' ? 'text-[#55c987]' : 'text-[#ff9d95]'}`}>{assignment.status}</span></div>{assignment.note && <p className="mt-2 text-[10px] text-[#dde1ec]">{assignment.note}</p>}{assignment.status === 'active' && <div className="mt-3 space-y-2"><input value={removalReason} onChange={(event) => setRemovalReason(event.target.value)} maxLength={500} placeholder="Removal reason (5+ characters)" className="w-full bg-[#14171f] border border-[#454d66] rounded p-2 text-xs text-white focus:border-[#c0392b] focus:outline-none" /><button onClick={() => handleRemoveAssignment(assignment.id)} disabled={removalReason.trim().length < 5} className="w-full py-2 rounded border border-[#c0392b] text-[#ff9d95] text-[10px] font-bold uppercase disabled:opacity-40">Remove assignment</button></div>}{assignment.status === 'removed' && <p className="mt-2 text-[9px] text-[#ff9d95]">Removed: {assignment.removalReason || 'No reason recorded'}</p>}</article>)}</div>
            {assignmentMsg && <p role="status" className="mt-4 text-[10px] font-bold text-[#d8c8ff]">{assignmentMsg}</p>}
          </section>
        </div>
      )}

      {taskCaseId && (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-end sm:items-center justify-center p-4">
          <section role="dialog" aria-modal="true" aria-label="My field tasks" className="w-full max-w-md max-h-[80vh] overflow-y-auto bg-[#14171f] border border-[#3a7bd5] rounded-lg p-5 shadow-2xl">
            <div className="flex justify-between gap-3 border-b border-[#252a3a] pb-3 mb-4"><div><h2 className="text-sm font-bold text-[#72a7f0] uppercase tracking-widest">My field tasks</h2><p className="mt-1 text-[10px] text-[#7880a0]">Complete a task with an optional handoff note, or return it with a specific inability reason.</p></div><button onClick={() => setTaskCaseId(null)} className="text-xs font-bold text-[#7880a0] uppercase">Close</button></div>
            <div className="space-y-3">{fieldTasks.length === 0 ? <p className="text-xs italic text-[#7880a0]">No task cards are assigned to this operation.</p> : fieldTasks.map((task) => <article key={task.id} className="rounded border border-[#252a3a] bg-[#0c0e14] p-3"><div className="flex justify-between gap-3"><div><h3 className="text-xs font-bold text-[#dde1ec]">{task.title}</h3><p className="mt-1 text-[9px] uppercase font-bold text-[#72a7f0]">{task.status}</p></div>{task.dueAt && <span className="text-[9px] text-[#f7c86b]">Due {new Date(task.dueAt).toLocaleString()}</span>}</div><p className="mt-3 text-xs leading-relaxed text-[#dde1ec]">{task.objective}</p>{task.checklist.length > 0 && <ul className="mt-3 space-y-1 text-[10px] text-[#9aa3bb]">{task.checklist.map((item, index) => <li key={`${task.id}-${index}`}>□ {item}</li>)}</ul>}{task.contextNote && <p className="mt-3 rounded border border-[#454d66] bg-[#14171f] p-2 text-[10px] text-[#d8c8ff]">{task.contextNote}</p>}{task.status === 'assigned' ? <div className="mt-3 space-y-2"><textarea value={taskCompletionNote} onChange={(event) => setTaskCompletionNote(event.target.value)} maxLength={1000} placeholder="Completion handoff note, or reason unable to complete" className="w-full min-h-16 bg-[#14171f] border border-[#454d66] rounded p-2 text-xs text-white focus:border-[#3a7bd5] focus:outline-none" /><div className="grid grid-cols-2 gap-2"><button onClick={() => handleCompleteTask(task.id, 'complete')} className="rounded bg-[#1d9a6c] py-2 text-[10px] font-bold uppercase text-white">Complete</button><button onClick={() => handleCompleteTask(task.id, 'unable')} disabled={taskCompletionNote.trim().length < 5} className="rounded border border-[#c0392b] py-2 text-[10px] font-bold uppercase text-[#ff9d95] disabled:opacity-40">Unable to complete</button></div></div> : <p className="mt-3 text-[10px] text-[#9aa3bb]">{task.status === 'complete' ? task.completionNote || 'Completed without an additional handoff note.' : `Returned: ${task.inabilityReason}`}</p>}</article>)}</div>
            {assignmentMsg && <p role="status" className="mt-4 text-[10px] font-bold text-[#72a7f0]">{assignmentMsg}</p>}
          </section>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#14171f] border border-[#252a3a] w-full max-w-sm rounded-lg p-6 shadow-2xl flex flex-col">
            <h2 className="text-lg font-bold text-white mb-4 uppercase tracking-widest">New Operation</h2>
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="block text-[10px] text-[#7880a0] font-bold uppercase mb-1">URN / Reference</label>
                <input type="text" value={newRef} onChange={(e) => setNewRef(e.target.value)} required placeholder="e.g. OP-GHOST-01" className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-sm text-white focus:border-[#3a7bd5] focus:outline-none font-mono uppercase" />
              </div>
              <div>
                <label className="block text-[10px] text-[#7880a0] font-bold uppercase mb-1">Operation Title</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required placeholder="Target Network Name" className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-sm text-white focus:border-[#3a7bd5] focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-[#7880a0] font-bold uppercase mb-1">Classification</label>
                <select value={newClass} onChange={(e) => setNewClass(e.target.value)} className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-sm text-white focus:border-[#3a7bd5] focus:outline-none uppercase">
                  <option value="OFFICIAL">Official</option><option value="OFFICIAL-SENSITIVE">Official-Sensitive</option><option value="SECRET">Secret</option>
                </select>
              </div>
              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 border border-[#454d66] text-[#dde1ec] rounded text-xs font-bold uppercase">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-[#3a7bd5] text-white rounded text-xs font-bold uppercase">Deploy</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <BottomTabBar />
    </div>
  );
};
