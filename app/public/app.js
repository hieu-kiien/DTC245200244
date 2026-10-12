let token = sessionStorage.getItem('t');
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const money = v => v == null || v === '' ? '' : Number(v).toLocaleString('vi-VN') + ' đ';
const dt = v => v ? new Date(v).toLocaleString('vi-VN', { timeZone: 'UTC', hour12: false, dateStyle: 'short', timeStyle: 'short' }) : '';
let toastTimer;
function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2800); }
async function api(path, method = 'GET', body) {
  const r = await fetch('/api/' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { clearSession(); throw new Error('Phiên đăng nhập đã hết hạn'); }
  if (!r.ok) { let m = 'Lỗi ' + r.status; try { m = (await r.json()).error || m; } catch (e) {} throw new Error(m); }
  return r.status === 204 ? null : r.json();
}
let L = { customers: [], pets: [], services: [] };
const nameOf = (list, id, f = 'name') => { const x = list.find(i => String(i.id) === String(id)); return x ? x[f] : ''; };
const badge = (v, map) => `<span class="badge ${map[v] || 'b-gray'}">${esc(v)}</span>`;
const PET_ST = { 'Còn hàng': 'b-green', 'Đã bán': 'b-gray', 'Đặt trước': 'b-yellow' };
const APT_ST = { 'Chờ': 'b-yellow', 'Hoàn thành': 'b-green', 'Đã hủy': 'b-red', 'Đang làm': 'b-blue' };
const M = {
  dashboard: { t: 'Tổng quan', s: 'Tình hình hoạt động của cửa hàng', i: 'home' },
  customers: { t: 'Khách hàng', s: 'Danh sách và thông tin liên hệ khách hàng', i: 'users', add: 'Thêm khách hàng',
    f: [['full_name','Họ tên','text',1],['phone','Số điện thoại','tel'],['email','Email','email'],['address','Địa chỉ','text']],
    cols: [['Họ tên',r=>`<b>${esc(r.full_name)}</b>`],['SĐT',r=>esc(r.phone)],['Email',r=>esc(r.email)],['Địa chỉ',r=>esc(r.address)]] },
  pets: { t: 'Thú cưng', s: 'Quản lý thú cưng đang bán và đã có chủ', i: 'heart', add: 'Thêm thú cưng',
    f: [['name','Tên thú cưng','text',1],['species','Loài','select',1,['Chó','Mèo','Thỏ','Hamster','Chim','Khác']],['breed','Giống','text'],['age','Tuổi (năm)','number'],['price','Giá bán (VNĐ)','number'],
        ['status','Trạng thái','select',0,['Còn hàng','Đặt trước','Đã bán']],['customer_id','Chủ nuôi','ref','customers']],
    cols: [['Tên',r=>`<b>${esc(r.name)}</b>`],['Loài',r=>esc(r.species)],['Giống',r=>esc(r.breed)],['Tuổi',r=>r.age == null ? '' : +r.age],['Giá',r=>money(r.price)],['Trạng thái',r=>badge(r.status,PET_ST)],['Chủ nuôi',r=>esc(nameOf(L.customers,r.customer_id,'full_name'))]] },
  services: { t: 'Dịch vụ spa', s: 'Bảng giá và thời lượng các dịch vụ chăm sóc', i: 'spa', add: 'Thêm dịch vụ',
    f: [['name','Tên dịch vụ','text',1],['price','Giá (VNĐ)','number',1],['duration_min','Thời lượng (phút)','number'],['description','Mô tả','textarea']],
    cols: [['Dịch vụ',r=>`<b>${esc(r.name)}</b>`],['Mô tả',r=>esc(r.description)],['Giá',r=>money(r.price)],['Thời lượng',r=>r.duration_min == null ? '' : esc(r.duration_min) + ' phút']] },
  appointments: { t: 'Lịch hẹn', s: 'Đặt lịch và theo dõi trạng thái lịch hẹn', i: 'cal', add: 'Đặt lịch hẹn',
    f: [['customer_id','Khách hàng','ref','customers',1],['pet_id','Thú cưng','ref','pets',1],['service_id','Dịch vụ','ref','services',1],['appt_time','Thời gian','datetime-local',1],
        ['status','Trạng thái','select',0,['Chờ','Đang làm','Hoàn thành','Đã hủy']],['note','Ghi chú','textarea']],
    cols: [['Thời gian',r=>`<b>${dt(r.appt_time)}</b>`],['Khách hàng',r=>esc(nameOf(L.customers,r.customer_id,'full_name'))],['Thú cưng',r=>esc(nameOf(L.pets,r.pet_id))],['Dịch vụ',r=>esc(nameOf(L.services,r.service_id))],['Trạng thái',r=>badge(r.status,APT_ST)],['Ghi chú',r=>esc(r.note)]] }
};
let cur = location.hash.slice(1) in M ? location.hash.slice(1) : 'dashboard', rows = [], editing = null, lastFocus = null;
function clearSession() { sessionStorage.removeItem('t'); token = null; show(); }
function logout() {
  const oldToken = token;
  clearSession();
  if (oldToken) fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + oldToken } }).catch(() => {});
}
function show() { $('#login').hidden = !!token; $('#main').hidden = !token; if (token) { nav(); load(); } }
function nav() {
  $('#nav').innerHTML = Object.entries(M).map(([k, m]) => `<a href="#${k}" ${k === cur ? 'aria-current="page"' : ''}>${icon(m.i)}${m.t}</a>`).join('');
}
window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (token && k in M && k !== cur) { cur = k; $('#q').value = ''; nav(); load(); } });
async function lookups() {
  const [c, p, s] = await Promise.all([api('customers'), api('pets'), api('services')]);
  L = { customers: c, pets: p, services: s };
}
async function load() {
  const m = M[cur]; $('#title').textContent = m.t; $('#subtitle').textContent = m.s; document.title = m.t + ' – PetShop';
  const isD = cur === 'dashboard';
  $('#add').hidden = isD; $('#q').parentElement.hidden = isD;
  if (!isD) $('#addt').textContent = m.add;
  $('#view').innerHTML = '<div class="panel"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  try {
    await lookups();
    if (isD) return await dashboard();
    rows = await api(cur); render();
  } catch (e) { if (e.message !== 'Phiên đăng nhập đã hết hạn') { $('#view').innerHTML = `<div class="panel empty">Không tải được dữ liệu: ${esc(e.message)}</div>`; } }
}
function bars(items) {
  const max = Math.max(1, ...items.map(i => i[1]));
  return `<div class="bars">${items.map(([l, n]) => `<div class="bar-row"><span>${esc(l)}</span><div class="bar-track"><div class="bar-fill" data-w="${Math.round(n / max * 100)}"></div></div><b>${n}</b></div>`).join('') || '<div class="empty">Chưa có dữ liệu</div>'}</div>`;
}
const countBy = (arr, k) => Object.entries(arr.reduce((a, x) => (a[x[k] || 'Khác'] = (a[x[k] || 'Khác'] || 0) + 1, a), {}));
async function dashboard() {
  const [s, ap] = await Promise.all([api('stats'), api('appointments')]);
  const card = (i, n, l, c) => `<div class="cardx"><div class="ico ${c}">${icon(i)}</div><div><b>${esc(n)}</b><span>${l}</span></div></div>`;
  const upcoming = ap.filter(a => a.status === 'Chờ').sort((a, b) => new Date(a.appt_time) - new Date(b.appt_time)).slice(0, 6);
  $('#view').innerHTML = `<div class="cards">${card('users', s.customers, 'Khách hàng', 't-blue')}${card('heart', s.pets, 'Thú cưng', 't-orange')}${card('spa', s.services, 'Dịch vụ spa', 't-green')}${card('cal', s.pending, 'Lịch hẹn đang chờ', 't-yellow')}</div>
  <div class="two"><div class="panel"><h3>Lịch hẹn sắp tới</h3>${upcoming.length ? `<div class="tbl-wrap"><table><thead><tr><th>Thời gian</th><th>Khách hàng</th><th>Thú cưng</th><th>Dịch vụ</th></tr></thead><tbody>${upcoming.map(a => `<tr><td><b>${dt(a.appt_time)}</b></td><td>${esc(nameOf(L.customers, a.customer_id, 'full_name'))}</td><td>${esc(nameOf(L.pets, a.pet_id))}</td><td>${esc(nameOf(L.services, a.service_id))}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">${icon('cal')}<div>Chưa có lịch hẹn đang chờ</div></div>`}</div>
  <div class="panel panel-pad"><h3>Thú cưng theo loài</h3>${bars(countBy(L.pets, 'species'))}<h3 class="gap-t">Lịch hẹn theo trạng thái</h3>${bars(countBy(ap, 'status'))}</div></div>`;
  animateBars();
}
function animateBars() { requestAnimationFrame(() => document.querySelectorAll('.bar-fill').forEach(b => b.style.width = b.dataset.w + '%')); }
function render() {
  const m = M[cur], q = $('#q').value.trim().toLowerCase();
  const list = !q ? rows : rows.filter(r => m.cols.some(([, f]) => f(r).replace(/<[^>]+>/g, '').toLowerCase().includes(q)));
  $('#view').innerHTML = `<div class="panel">${list.length ? `<div class="tbl-wrap"><table><thead><tr>${m.cols.map(([h]) => `<th>${h}</th>`).join('')}<th><span class="sr">Thao tác</span></th></tr></thead><tbody>${list.map(r => `<tr>${m.cols.map(([, f]) => `<td>${f(r)}</td>`).join('')}<td class="act"><button class="btn sm" data-e="${r.id}" aria-label="Sửa">${icon('edit')}Sửa</button><button class="btn sm danger" data-d="${r.id}" aria-label="Xóa">${icon('trash')}Xóa</button></td></tr>`).join('')}</tbody></table></div><div class="foot-count">${list.length} / ${rows.length} bản ghi</div>` : `<div class="empty">${icon(m.i)}<div>${q ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có dữ liệu. Nhấn “' + m.add + '” để bắt đầu.'}</div></div>`}</div>`;
  $('#view').querySelectorAll('[data-e]').forEach(b => b.onclick = () => openForm(rows.find(r => String(r.id) === b.dataset.e)));
  $('#view').querySelectorAll('[data-d]').forEach(b => b.onclick = () => askDelete(b.dataset.d));
}
function askDelete(id) {
  lastFocus = document.activeElement; $('#cm').textContent = 'Bản ghi sẽ bị xóa vĩnh viễn và không thể khôi phục.'; $('#confirm').hidden = false; $('#cn').focus();
  $('#cy').onclick = async () => { $('#confirm').hidden = true; try { await api(cur + '/' + id, 'DELETE'); toast('Đã xóa'); load(); } catch (e) { toast(e.message, 1); } };
}
function field([k, label, type, a, b], v) {
  const req = (type === 'ref' ? b : a) ? 'required' : '';
  const full = type === 'textarea' ? 'full' : '';
  let input;
  if (type === 'select') input = `<select id="f-${k}" name="${k}" ${req}>${b.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  else if (type === 'ref') { const key = a === 'customers' ? 'full_name' : 'name';
    input = `<select id="f-${k}" name="${k}" ${req}><option value="">— Chọn —</option>${L[a].map(o => `<option value="${o.id}" ${String(o.id) === String(v) ? 'selected' : ''}>${esc(o[key])}</option>`).join('')}</select>`; }
  else if (type === 'textarea') input = `<textarea id="f-${k}" name="${k}" rows="2">${esc(v)}</textarea>`;
  else input = `<input id="f-${k}" name="${k}" type="${type}" value="${esc(type === 'datetime-local' && v ? String(v).slice(0, 16) : v)}" ${req} ${type === 'number' ? 'step="any" min="0"' : ''}>`;
  return `<label class="${full}" for="f-${k}"><span>${label}${req ? ' <span class="req" aria-hidden="true">*</span>' : ''}</span>${input}</label>`;
}
function openForm(r) {
  lastFocus = document.activeElement; editing = r || null; const m = M[cur];
  $('#mt').textContent = (r ? 'Sửa ' : 'Thêm ') + m.t.toLowerCase();
  $('#mb').innerHTML = m.f.map(f => field(f, r ? r[f[0]] : (f[0] === 'status' ? f[4][0] : ''))).join('');
  $('#modal').hidden = false; const first = $('#mb').querySelector('input,select,textarea'); if (first) first.focus();
}
function closeAll() { $('#modal').hidden = true; $('#confirm').hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
$('#add').onclick = () => openForm();
$('#mc').onclick = $('#mx').onclick = $('#cn').onclick = closeAll;
document.querySelectorAll('.modal').forEach(m => m.addEventListener('mousedown', e => { if (e.target === m) closeAll(); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && (!$('#modal').hidden || !$('#confirm').hidden)) closeAll(); });
$('#mf').onsubmit = async e => {
  e.preventDefault(); const btn = $('#ms'); btn.disabled = true;
  try { const o = Object.fromEntries(new FormData(e.target));
    if (editing) await api(cur + '/' + editing.id, 'PUT', o); else await api(cur, 'POST', o);
    $('#modal').hidden = true; toast(editing ? 'Đã cập nhật' : 'Đã thêm mới'); load();
  } catch (er) { toast(er.message, 1); } finally { btn.disabled = false; }
};
$('#q').oninput = render;
$('#lf').onsubmit = async e => {
  e.preventDefault(); const b = $('#lb');
  if (!$('#u').value || !$('#p').value) { $('#err').textContent = 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu'; return; }
  b.disabled = true; b.textContent = 'Đang đăng nhập...';
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#u').value, password: $('#p').value }) });
    if (r.ok) { token = (await r.json()).token; sessionStorage.setItem('t', token); $('#err').textContent = ''; $('#p').value = ''; show(); }
    else $('#err').textContent = r.status === 429 ? 'Thử quá nhiều lần, vui lòng đợi giây lát' : 'Sai tên đăng nhập hoặc mật khẩu';
  } catch (er) { $('#err').textContent = 'Không kết nối được máy chủ'; }
  b.disabled = false; b.textContent = 'Đăng nhập';
};
$('#out').onclick = logout;
show();
