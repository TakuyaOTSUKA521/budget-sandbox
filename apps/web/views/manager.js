import { createNode, updateNode, deleteNode, promoteToParent, archiveNode } from '../packages/core/nodes.js';
import { supabase } from '../lib/supabase.js';
import { esc } from '../lib/format.js';
import { loadAllNodesWithPaths } from '../lib/nodes.js';
import { root, state, ui, nodesById, invalidateTxCache, render, go } from '../state.js';
import { treeToggleCell, renderNodeTree } from '../components/collapsibleTree.js';
import { isNodeHidden, setNodeHidden } from '../components/maskToggle.js';
import { toggleChip, wireToggleChip, isToggleChipOn } from '../components/toggleChip.js';
import { confirmDialog } from '../components/confirmDialog.js';

// ノード管理 modal: state lives outside `state` on purpose. `go()` fully
// replaces `state`, which would otherwise blow away whatever page it's
// layered on top of (記録 or ノード一覧) the moment the modal opened.
export let managerOpen = false;
// Opened straight into editing one node (ノード詳細's 編集): キャンセル then
// closes the modal instead of falling back to the 新しいノード form.
let managerOpenedForNode = false;
let managerEditNode = null;
let managerPendingPromote = null;

// Passing a nodeId opens straight into editing that node (ノード詳細's 編集).
export async function openManager(nodeId = null) {
  if (nodeId && !nodesById.has(nodeId)) await loadAllNodesWithPaths();
  managerOpen = true;
  managerOpenedForNode = Boolean(nodeId);
  managerEditNode = nodeId ? nodesById.get(nodeId) ?? null : null;
  managerPendingPromote = null;
  ui.resetManagerForm = true;
  render();
}

function closeManager() {
  closeManagerSilently();
  render();
}

// Deletion also supersedes every line touching the node (see nodes.js#deleteNode) -
// a transaction always has two ends, so removing it changes both nodes' history,
// not just the one being deleted here.
async function handleDeleteNode(nodeId) {
  const node = nodesById.get(nodeId);
  const label = node?.path ?? node?.name ?? nodeId;
  const ok = await confirmDialog({
    title: 'このノードを削除しますか',
    summaryHtml: `${esc(label)}<div style="margin-top:4px;font-size:12.5px;color:var(--muted);">関連する取引もすべて削除されます。元に戻せません。</div>`
  });
  if (!ok) return;

  try {
    await deleteNode(supabase, nodeId);
  } catch (error) {
    alert(error.message);
    return;
  }

  invalidateTxCache();
  // The page underneath may be this node's own ノード詳細, which no longer exists.
  if (state.page === 'detail' && state.detailNodeId === nodeId) {
    closeManagerSilently();
    go('nodes');
    return;
  }
  if (managerEditNode?.id === nodeId) {
    managerEditNode = null;
    ui.resetManagerForm = true;
  }
  await render();
}

function closeManagerSilently() {
  managerOpen = false;
  managerEditNode = null;
  managerPendingPromote = null;
  ui.resetManagerForm = true;
}

// ============================================================
// ノード管理
// ============================================================

// ノード管理: a modal layered over whichever screen opened it (記録 or
// ノード一覧), not a page - see .webui-ref navigation brief 2-C. Its tree is
// a lightweight reference for placement only; balances/graphs/archiving
// stay the job of ノード一覧 (brief's explicit boundary, not to be blurred).
export async function renderManagerModal() {
  const nodes = await loadAllNodesWithPaths();
  const pending = managerPendingPromote;
  const editNode = managerEditNode;

  // A node can't become its own parent, and can't move under its own
  // descendant either (the DB blocks the cycle anyway, but filtering it out
  // of the picker up front is clearer than surfacing a DB error for it).
  const excludedIds = editNode
    ? new Set(nodes.filter((n) => n.id === editNode.id || n.path.startsWith(`${editNode.path} > `)).map((n) => n.id))
    : new Set();

  const draft = ui.managerDraft;
  ui.managerDraft = null;

  const selectedParentId = draft ? (draft.parentId ?? '') : pending?.parentId ?? (editNode ? (editNode.parent_id ?? '') : '');
  const parentOptions = ['<option value="">なし（ルートノード）</option>']
    .concat(
      nodes
        .filter((n) => !excludedIds.has(n.id))
        .map((n) => `<option value="${n.id}" ${selectedParentId === n.id ? 'selected' : ''}>${esc(n.path)}</option>`)
    )
    .join('');

  const parentNode = pending ? nodesById.get(pending.parentId) : null;
  // Type follows the chosen parent (and is locked to it), same as the
  // parent-select change handler does live; locked to itself while editing.
  const typeParent = nodesById.get(selectedParentId);
  const typeLocked = Boolean(editNode || typeParent);
  const selectedNodeType = editNode?.node_type ?? typeParent?.node_type ?? draft?.nodeType ?? 'flow';
  const nameValue = draft?.name ?? pending?.name ?? editNode?.name ?? '';
  const excludeChecked = draft?.excludeFromFlowTotals ?? pending?.excludeFromFlowTotals ?? editNode?.exclude_from_flow_totals ?? false;
  // マスク・アーカイブ(ノード詳細ではここで切り替える)。アーカイブは葉ノードのみ
  // (中間ノードを隠すと子が一覧から迷子になる - ノード一覧の 📦 と同じ条件)。
  const editIsLeaf = editNode ? !nodes.some((n) => n.parent_id === editNode.id) : false;
  const hiddenChecked = draft?.hidden ?? (editNode ? isNodeHidden(editNode.id) : false);
  const archiveChecked = draft?.archive ?? false;

  const confirmBox = pending ? `
    <div class="confirm-box">
      <div style="font-size:12.5px;font-weight:700;margin-bottom:4px;">階層化の確認</div>
      <p style="margin:0 0 12px;font-size:12.5px;color:var(--label);line-height:1.7;">
        「${esc(parentNode?.name ?? '')}」には既に記録があります。既存の記録を「その他（${esc(parentNode?.name ?? '')}）」へ移して階層化しますか？
      </p>
      <div style="display:flex;gap:8px;">
        <button id="confirm-promote-btn" class="btn" style="background:var(--text);color:var(--card);border:none;">${pending.action === 'move' ? '移して更新' : '移して作成'}</button>
        <button id="cancel-promote-btn" class="btn">やめる</button>
      </div>
    </div>
  ` : '';

  // Collapsible so a large hierarchy doesn't turn this into a long scroll of
  // rows - each node folds its descendants away until its ▸ is expanded.
  // Rows carry no buttons: tapping one opens it in the form above (削除 is in
  // that form's footer, behind a confirm dialog).
  const treeRows = renderNodeTree(nodes, (n, depth, hasChildren) => `
    <div class="row tree-edit-row${editNode?.id === n.id ? ' selected' : ''}" data-id="${n.id}">
      ${treeToggleCell(n.id, hasChildren)}
      <span style="padding-left:${depth * 16}px;${depth ? 'color:var(--muted);' : ''}flex:1;">${esc(n.name)}</span>
      <span style="font-size:11px;color:var(--faint);letter-spacing:0.03em;">${n.node_type}</span>
      <span class="chev" aria-hidden="true">›</span>
    </div>
  `);

  return `
    <div class="modal-backdrop" id="manager-backdrop"></div>
    <div role="dialog" aria-label="ノード管理" class="modal-panel">
      <div class="modal-head">
        <h2>ノード管理</h2>
        <button type="button" class="modal-close-btn" id="manager-close-btn" aria-label="閉じる">×</button>
      </div>
      <div class="modal-body">
        <div class="stack" style="gap:14px;">
          <h1 style="font-size:14px;">${editNode ? `ノードを編集：${esc(editNode.name)}` : '新しいノード'}</h1>
          <div class="field-pair">
            <label class="field">親ノード<select id="node-parent-select">${parentOptions}</select></label>
            <label class="field">種別
              <select id="node-type-select" ${typeLocked ? 'disabled' : ''}>
                <option value="flow" ${selectedNodeType === 'flow' ? 'selected' : ''}>flow（支出・収入先）</option>
                <option value="asset" ${selectedNodeType === 'asset' ? 'selected' : ''}>asset（資産）</option>
                <option value="liability" ${selectedNodeType === 'liability' ? 'selected' : ''}>liability（負債）</option>
              </select>
            </label>
          </div>
          <label class="field">ノード名<input id="node-name" type="text" placeholder="例: マクドナルド" value="${esc(nameValue)}"></label>
          <label class="field" id="node-exclude-flow-field" style="${selectedNodeType === 'flow' ? '' : 'display:none;'}">
            <span style="display:flex;align-items:flex-start;gap:8px;font-weight:400;">
              <input type="checkbox" id="node-exclude-flow" style="flex:0 0 auto;margin-top:3px;" ${excludeChecked ? 'checked' : ''}>
              <span style="flex:1;">収支の集計・構成比から除外する(初期残高など)</span>
            </span>
          </label>
          ${editNode ? `
            <div class="chip-row">
              ${toggleChip('node-hidden-chip', '金額を隠す', { on: hiddenChecked })}
              ${editIsLeaf ? toggleChip('node-archive-chip', 'アーカイブ', { on: archiveChecked }) : ''}
            </div>
          ` : ''}
          <p id="node-create-error" style="color:var(--negative);font-size:12px;margin:0;"></p>
          ${confirmBox}
        </div>

        <div>
          <h3 style="margin-bottom:6px;">既存の階層</h3>
          <div id="tree-rows">${treeRows}</div>
        </div>
      </div>
      <div class="modal-foot">
        ${editNode ? `<button type="button" id="node-delete-btn" class="link-danger">このノードを削除</button>` : '<span></span>'}
        <div class="modal-foot-actions">
          <button id="cancel-node-edit-btn" type="button" class="btn">キャンセル</button>
          <button id="node-create-btn" class="btn-primary">${editNode ? '更新' : 'ノードを作成'}</button>
        </div>
      </div>
    </div>
  `;
}

export function wireManagerModal() {
  document.getElementById('manager-backdrop').addEventListener('click', closeManager);
  document.getElementById('manager-close-btn').addEventListener('click', closeManager);

  const excludeFlowField = document.getElementById('node-exclude-flow-field');
  const syncExcludeFlowVisibility = () => {
    excludeFlowField.style.display = document.getElementById('node-type-select').value === 'flow' ? '' : 'none';
  };

  document.getElementById('node-parent-select').addEventListener('change', (e) => {
    if (managerEditNode) return; // type stays locked while editing, regardless of parent
    const typeSelect = document.getElementById('node-type-select');
    const parent = nodesById.get(e.target.value);
    if (parent) {
      typeSelect.value = parent.node_type;
      typeSelect.disabled = true;
    } else {
      typeSelect.disabled = false;
    }
    syncExcludeFlowVisibility();
  });

  document.getElementById('node-type-select').addEventListener('change', syncExcludeFlowVisibility);

  document.getElementById('node-create-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('node-create-error');
    errorEl.textContent = '';

    const name = document.getElementById('node-name').value.trim();
    const parentId = document.getElementById('node-parent-select').value || null;
    const nodeType = document.getElementById('node-type-select').value;
    const excludeFromFlowTotals = nodeType === 'flow' ? document.getElementById('node-exclude-flow').checked : false;
    if (!name) {
      errorEl.textContent = 'ノード名を入力してください';
      return;
    }

    const editNode = managerEditNode;
    const archive = editNode && isToggleChipOn('node-archive-chip');

    try {
      if (editNode) {
        await updateNode(supabase, editNode.id, { name, parentId, excludeFromFlowTotals });
        // マスクは端末ごとの表示設定なので、DB の更新が通ってから反映する。
        setNodeHidden(editNode.id, isToggleChipOn('node-hidden-chip'));
        if (archive) await archiveNode(supabase, editNode.id);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        await createNode(supabase, { userId: user.id, name, parentId, nodeType, excludeFromFlowTotals });
      }
    } catch (error) {
      if (parentId && error.message.includes('promote_to_parent')) {
        managerPendingPromote = editNode
          ? { action: 'move', nodeId: editNode.id, parentId, name, excludeFromFlowTotals }
          : { action: 'create', parentId, nodeType, name, excludeFromFlowTotals };
        render();
        return;
      }
      errorEl.textContent = error.message;
      return;
    }

    // An archived node drops out of every list, its own ノード詳細 included.
    if (archive && state.page === 'detail' && state.detailNodeId === editNode.id) {
      closeManagerSilently();
      go('nodes');
      return;
    }
    // Opened from ノード詳細's 編集: done editing that one node, so close.
    if (editNode && managerOpenedForNode) {
      closeManager();
      return;
    }
    // Stays open (unlike closeManager) so adding several nodes in a row
    // doesn't mean reopening the modal each time.
    managerPendingPromote = null;
    managerEditNode = null;
    ui.resetManagerForm = true;
    render();
  });

  const confirmBtn = document.getElementById('confirm-promote-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const pending = managerPendingPromote;
      try {
        await promoteToParent(supabase, pending.parentId);
        if (pending.action === 'move') {
          await updateNode(supabase, pending.nodeId, { name: pending.name, parentId: pending.parentId, excludeFromFlowTotals: pending.excludeFromFlowTotals });
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          await createNode(supabase, { userId: user.id, name: pending.name, parentId: pending.parentId, nodeType: pending.nodeType, excludeFromFlowTotals: pending.excludeFromFlowTotals });
        }
      } catch (error) {
        document.getElementById('node-create-error').textContent = error.message;
        return;
      }
      managerPendingPromote = null;
      managerEditNode = null;
      ui.resetManagerForm = true;
      render();
    });
  }

  const cancelBtn = document.getElementById('cancel-promote-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      managerPendingPromote = null;
      render();
    });
  }

  // キャンセル: editing a node picked from the tree goes back to the 新しいノード
  // form; otherwise (creating, or opened for one node) it closes the modal.
  document.getElementById('cancel-node-edit-btn').addEventListener('click', () => {
    if (!managerEditNode || managerOpenedForNode) {
      closeManager();
      return;
    }
    managerEditNode = null;
    managerPendingPromote = null;
    ui.resetManagerForm = true;
    render();
  });

  wireToggleChip('node-hidden-chip');
  wireToggleChip('node-archive-chip');

  document.getElementById('node-delete-btn')?.addEventListener('click', () => handleDeleteNode(managerEditNode.id));

  root.querySelectorAll('.tree-edit-row').forEach((row) => {
    row.addEventListener('click', () => {
      managerEditNode = nodesById.get(row.dataset.id);
      managerOpenedForNode = false;
      managerPendingPromote = null;
      ui.resetManagerForm = true;
      render();
    });
  });
}
