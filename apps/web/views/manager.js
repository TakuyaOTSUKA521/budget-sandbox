import { createNode, updateNode, deleteNode, promoteToParent } from '../packages/core/nodes.js';
import { supabase } from '../lib/supabase.js';
import { esc } from '../lib/format.js';
import { loadAllNodesWithPaths } from '../lib/nodes.js';
import { root, state, ui, nodesById, invalidateTxCache, render } from '../state.js';
import { treeToggleCell, renderNodeTree } from '../components/collapsibleTree.js';

// ノード管理 modal: state lives outside `state` on purpose. `go()` fully
// replaces `state`, which would otherwise blow away whatever page it's
// layered on top of (記録 or ノード一覧) the moment the modal opened.
export let managerOpen = false;
let managerFrom = '記録';
let managerEditNode = null;
let managerPendingPromote = null;

// Passing a nodeId opens straight into editing that node (ノード詳細's 編集).
export async function openManager(nodeId = null) {
  if (nodeId && !nodesById.has(nodeId)) await loadAllNodesWithPaths();
  managerOpen = true;
  managerFrom = { nodes: 'ノード一覧', detail: 'ノード詳細' }[state.page] ?? '記録';
  managerEditNode = nodeId ? nodesById.get(nodeId) ?? null : null;
  managerPendingPromote = null;
  ui.resetManagerForm = true;
  render();
}

function closeManager() {
  managerOpen = false;
  managerEditNode = null;
  managerPendingPromote = null;
  ui.resetManagerForm = true;
  render();
}

// Deletion also supersedes every line touching the node (see nodes.js#deleteNode) -
// a transaction always has two ends, so removing it changes both nodes' history,
// not just the one being deleted here.
async function handleDeleteNode(nodeId) {
  const node = nodesById.get(nodeId);
  const label = node?.path ?? node?.name ?? nodeId;
  if (!confirm(`「${label}」を削除しますか？関連する取引もすべて削除されます（元に戻せません）。`)) return;

  let result;
  try {
    result = await deleteNode(supabase, nodeId);
  } catch (error) {
    alert(error.message);
    return;
  }

  if (managerEditNode?.id === nodeId) {
    managerEditNode = null;
    ui.resetManagerForm = true;
  }
  invalidateTxCache();
  await render();

  if (result.archived) {
    alert('過去の取引履歴が残っているため完全な削除はできず、取引を削除したうえでノードをアーカイブしました。');
  }
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
  const treeRows = renderNodeTree(nodes, (n, depth, hasChildren) => `
    <div class="row">
      ${treeToggleCell(n.id, hasChildren)}
      <span style="padding-left:${depth * 16}px;${depth ? 'color:var(--muted);' : ''}flex:1;">${esc(n.name)}</span>
      <span style="font-size:11px;color:var(--faint);letter-spacing:0.03em;">${n.node_type}</span>
      <button type="button" class="btn-sm tree-edit-btn" data-id="${n.id}">編集</button>
      <button type="button" class="btn-sm danger tree-delete-btn" data-id="${n.id}">削除</button>
    </div>
  `);

  return `
    <div class="modal-backdrop" id="manager-backdrop"></div>
    <div role="dialog" aria-label="ノード管理" class="modal-panel">
      <div class="modal-head">
        <div>
          <h2>ノード管理</h2>
          <p style="margin:3px 0 0;font-size:12px;color:var(--muted);">「${esc(managerFrom)}」の上に重ねて表示中。閉じると元の画面に戻ります。</p>
        </div>
        <button type="button" class="modal-close-btn" id="manager-close-btn">×</button>
      </div>
      <div class="modal-body">
        <div class="stack" style="gap:16px;">
          <h1 style="font-size:14px;">${editNode ? `ノードを編集：${esc(editNode.name)}` : '新しいノード'}</h1>
          <label class="field">親ノード<select id="node-parent-select">${parentOptions}</select></label>
          <label class="field">種別
            <select id="node-type-select" ${typeLocked ? 'disabled' : ''}>
              <option value="flow" ${selectedNodeType === 'flow' ? 'selected' : ''}>flow（支出・収入先）</option>
              <option value="asset" ${selectedNodeType === 'asset' ? 'selected' : ''}>asset（資産）</option>
              <option value="liability" ${selectedNodeType === 'liability' ? 'selected' : ''}>liability（負債）</option>
            </select>
          </label>
          <label class="field">ノード名<input id="node-name" type="text" placeholder="例: マクドナルド" value="${esc(nameValue)}"></label>
          <label class="field" id="node-exclude-flow-field" style="${selectedNodeType === 'flow' ? '' : 'display:none;'}">
            <span style="display:flex;align-items:flex-start;gap:8px;font-weight:400;">
              <input type="checkbox" id="node-exclude-flow" style="flex:0 0 auto;margin-top:3px;" ${excludeChecked ? 'checked' : ''}>
              <span style="flex:1;">収支の集計・構成比から除外する(初期残高など)</span>
            </span>
          </label>
          <div style="display:flex;gap:8px;">
            <button id="node-create-btn" class="btn-primary" style="flex:1;">${editNode ? '更新' : 'ノードを作成'}</button>
            <button id="cancel-node-edit-btn" type="button" class="btn" style="${editNode ? '' : 'display:none;'}">キャンセル</button>
          </div>
          <p id="node-create-error" style="color:var(--negative);font-size:12px;margin:0;"></p>
          ${confirmBox}
        </div>

        <div>
          <h3>既存の階層</h3>
          <p style="margin:4px 0 8px;font-size:11.5px;color:var(--faint);line-height:1.7;">配置を決めるための参照です。残高・グラフ・アーカイブはノード一覧の役割です。</p>
          <div id="tree-rows">${treeRows}</div>
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

    try {
      if (editNode) {
        await updateNode(supabase, editNode.id, { name, parentId, excludeFromFlowTotals });
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

  const cancelEditBtn = document.getElementById('cancel-node-edit-btn');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      managerEditNode = null;
      managerPendingPromote = null;
      ui.resetManagerForm = true;
      render();
    });
  }

  root.querySelectorAll('.tree-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      managerEditNode = nodesById.get(btn.dataset.id);
      managerPendingPromote = null;
      ui.resetManagerForm = true;
      render();
    });
  });

  root.querySelectorAll('.tree-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteNode(btn.dataset.id));
  });
}
