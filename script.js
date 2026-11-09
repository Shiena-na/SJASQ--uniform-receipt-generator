/* ===================== PRICE CATALOG (from SJASQ PE & Uniform delivery records) ===================== */
const CATALOG = {
  "Elementary": {
    "T-Shirt": {XS:165,S:165,M:175,L:175,XL:195,"2XL":195,"3XL":220,"4XL":245,"5XL":245,"6XL":245},
    "Jogging Pants": {XS:330,S:330,M:345,L:345,XL:360,"2XL":360,"3XL":375,"4XL":375,"5XL":390,"6XL":390}
  },
  "Junior High School": {
    "T-Shirt": {XS:185,S:185,M:200,L:200,XL:215,"2XL":215,"3XL":230,"4XL":230,"5XL":240,"6XL":240},
    "Jogging Pants": {XS:350,S:350,M:365,L:365,XL:385,"2XL":385,"3XL":400,"4XL":400,"5XL":400,"6XL":415}
  },
  "Senior High School": {
    "T-Shirt": {XS:205,S:205,M:220,L:220,XL:230,"2XL":230,"3XL":245,"4XL":245,"5XL":255,"6XL":255},
    "Jogging Pants": {XS:285,S:285,M:300,L:300,XL:320,"2XL":320,"3XL":335,"4XL":325,"5XL":325,"6XL":350}
  }
};
const CUSTOM = "__custom";

/* ===================== STORAGE (localStorage, this browser only) ===================== */
const RECEIPTS_KEY = "sjasq_receipts_v1";
const SETTINGS_KEY = "sjasq_settings_v1";
const SEQ_KEY      = "sjasq_seq_v1";
const DEFAULT_SETTINGS = {
  shopName: "St. Joseph Academy of Sariaya, Quezon",
  tagline: "School & PE Uniforms — Made to Order",
  address: "Sariaya, Quezon, Philippines",
  contact: "",
  pin: "1234"
};

const store = {
  ok: true,
  test(){
    try{ localStorage.setItem("__t","1"); localStorage.removeItem("__t"); this.ok = true; }
    catch(e){ this.ok = false; }
    return this.ok;
  },
  read(key, fallback){
    let raw = null;
    try{ raw = localStorage.getItem(key); }catch(e){ return fallback; }
    if(raw == null) return fallback;
    try{ return JSON.parse(raw); }
    catch(e){
      // keep a copy of unreadable data so it can never be silently overwritten
      try{ localStorage.setItem(key + "_corrupt_backup", raw); }catch(_){}
      return fallback;
    }
  },
  write(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch(e){ return false; }
  }
};
const getReceipts = () => { const r = store.read(RECEIPTS_KEY, []); return Array.isArray(r) ? r : []; };
const putReceipts = list => store.write(RECEIPTS_KEY, list);
const getSettings = () => Object.assign({}, DEFAULT_SETTINGS, store.read(SETTINGS_KEY, {}));

/* ===================== HELPERS ===================== */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const peso = n => {
  n = Number(n) || 0;
  const s = Math.abs(n).toLocaleString("en-PH", {minimumFractionDigits:2, maximumFractionDigits:2});
  return (n < 0 ? "-₱" : "₱") + s;
};
// Local date (not UTC), so the date is right in the Philippines at any hour.
function todayLocal(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function nowParts(){
  const d = new Date();
  return { date: todayLocal(), time: String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0") };
}
function fmtTime(t){
  if(!t) return "";
  const [h, m] = t.split(":").map(Number);
  return (h % 12 || 12) + ":" + String(m).padStart(2,"0") + " " + (h < 12 ? "AM" : "PM");
}
const fmtStamp = (date, time) => fmtDate(date) + (time ? ", " + fmtTime(time) : "");
function fmtDate(iso){
  if(!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? "" : d.toLocaleDateString("en-PH", {year:"numeric", month:"short", day:"numeric"});
}
function toast(msg){
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2800);
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function validQty(v){ if(v === "" || v == null) return false; const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 9999; }
function validMoney(v, allowEmpty){
  if(v === "" || v == null) return !!allowEmpty;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 10000000 && Math.abs(n*100 - Math.round(n*100)) < 1e-6;
}

/* ===================== STATE ===================== */
let S;            // current receipt being edited
let dirty = false;
let admin = false;

function blankState(){
  return { id:null, receiptNo: nextReceiptNo(), ...nowParts(), claimDate:"", customer:"", notes:"",
           rows:[newRow()], discount:"", paid:"", shop:null };
}
function newRow(prev){
  const level = prev && !prev.custom ? prev.level : Object.keys(CATALOG)[0];
  const item  = prev && !prev.custom ? prev.item  : Object.keys(CATALOG[level])[0];
  const size  = Object.keys(CATALOG[level][item])[0];
  return { custom:false, level, item, size, qty:"", price:String(CATALOG[level][item][size]) };
}
function catalogPrice(r){
  if(r.custom) return null;
  const p = CATALOG[r.level] && CATALOG[r.level][r.item] && CATALOG[r.level][r.item][r.size];
  return p == null ? null : p;
}
function markDirty(){ dirty = true; updateSaveState(); }

/* ===================== RECEIPT NUMBERS (SJ-YYYY-0001, never reused) ===================== */
function parseNo(no){
  const m = /^SJ-(\d{4})-(\d+)$/.exec(no || "");
  return m ? {year:+m[1], seq:+m[2]} : null;
}
function nextReceiptNo(){
  const year = new Date().getFullYear();
  let max = 0;
  getReceipts().forEach(r => { const p = parseNo(r.receiptNo); if(p && p.year === year && p.seq > max) max = p.seq; });
  const counters = store.read(SEQ_KEY, {});
  max = Math.max(max, counters[year] || 0);   // counter keeps numbers unique even after a delete
  return "SJ-" + year + "-" + String(max + 1).padStart(4, "0");
}
function bumpSeq(no){
  const p = parseNo(no); if(!p) return;
  const counters = store.read(SEQ_KEY, {});
  if((counters[p.year] || 0) < p.seq){ counters[p.year] = p.seq; store.write(SEQ_KEY, counters); }
}

/* ===================== CALCULATIONS ===================== */
function calc(){
  let qty = 0, sub = 0;
  S.rows.forEach(r => {
    const q = validQty(r.qty) ? Number(r.qty) : 0;
    const p = validMoney(r.price, false) ? Number(r.price) : 0;
    qty += q; sub += round2(q * p);
  });
  sub = round2(sub);
  const disc = validMoney(S.discount, true) ? round2(Number(S.discount || 0)) : 0;
  const total = round2(Math.max(0, sub - disc));
  const paid = validMoney(S.paid, true) ? round2(Number(S.paid || 0)) : 0;
  const balance = round2(total - paid);
  return { qty, sub, disc, total, paid, balance };
}

/* ===================== ORDER ROWS ===================== */
function itemOptionsHTML(r){
  let h = "";
  for(const level of Object.keys(CATALOG)){
    h += `<optgroup label="${esc(level)}">`;
    for(const item of Object.keys(CATALOG[level])){
      const v = level + "|" + item;
      const sel = !r.custom && r.level === level && r.item === item ? " selected" : "";
      h += `<option value="${esc(v)}"${sel}>${esc(level + " — " + item)}</option>`;
    }
    h += `</optgroup>`;
  }
  if(r.custom) h += `<option value="${CUSTOM}" selected>${esc(r.item) || "Other item"}</option>`;   // only for old receipts
  return h;
}
function sizeOptionsHTML(r){
  return Object.keys(CATALOG[r.level][r.item]).map(s => `<option value="${esc(s)}"${s === r.size ? " selected" : ""}>${esc(s)}</option>`).join("");
}
function rowHTML(r, i){
  const priceLocked = !r.custom && !admin;
  const cp = catalogPrice(r);
  const edited = cp != null && validMoney(r.price,false) && Number(r.price) !== cp;
  return `
  <div class="orow" data-i="${i}">
    <div class="cell c-item"><label>Uniform item</label>
      <select class="r-item" aria-label="Uniform item">${itemOptionsHTML(r)}</select>
      ${r.custom ? `<input type="text" class="r-cname cname" placeholder="Item name" maxlength="60" value="${esc(r.item)}" aria-label="Custom item name">` : ""}
    </div>
    <div class="cell c-size"><label>Size</label>
      ${r.custom
        ? `<input type="text" class="r-csize" maxlength="12" placeholder="Size" value="${esc(r.size)}" aria-label="Size">`
        : `<select class="r-size" aria-label="Size">${sizeOptionsHTML(r)}</select>`}
    </div>
    <div class="cell c-qty"><label>Qty</label>
      <input type="number" class="r-qty" min="1" max="9999" step="1" inputmode="numeric" placeholder="0" value="${esc(r.qty)}" aria-label="Quantity">
    </div>
    <div class="cell c-price"><label>Unit price</label>
      <input type="number" class="r-price${edited ? " edited" : ""}" min="0" step="0.01" inputmode="decimal" value="${esc(r.price)}"
             ${priceLocked ? "readonly tabindex=\"-1\" title=\"Unlock Admin mode to change prices\"" : ""} aria-label="Unit price">
    </div>
    <div class="cell c-sub"><label>Subtotal</label><output class="r-sub">${peso(0)}</output></div>
    <div class="cell c-del"><button type="button" class="del" title="Remove item" aria-label="Remove item">✕</button></div>
  </div>`;
}
function renderRows(){
  $("rows").innerHTML = S.rows.map(rowHTML).join("");
  S.rows.forEach((_, i) => updateRowCalc(i));
  renderAll();
}
function updateRowCalc(i){
  const el = $("rows").children[i]; if(!el) return;
  const r = S.rows[i];
  const q = validQty(r.qty) ? Number(r.qty) : 0;
  const p = validMoney(r.price, false) ? Number(r.price) : 0;
  el.querySelector(".r-sub").textContent = peso(round2(q * p));
  const cp = catalogPrice(r);
  el.querySelector(".r-price").classList.toggle("edited", cp != null && validMoney(r.price,false) && Number(r.price) !== cp);
}

$("rows").addEventListener("input", e => {
  const el = e.target.closest(".orow"); if(!el) return;
  const i = +el.dataset.i, r = S.rows[i], t = e.target;
  if(t.classList.contains("r-qty")) r.qty = t.value;
  else if(t.classList.contains("r-price")) r.price = t.value;
  else if(t.classList.contains("r-cname")) r.item = t.value;
  else if(t.classList.contains("r-csize")) r.size = t.value;
  else return;
  t.classList.remove("invalid");
  markDirty(); updateRowCalc(i); renderAll();
});
$("rows").addEventListener("change", e => {
  const el = e.target.closest(".orow"); if(!el) return;
  const i = +el.dataset.i, r = S.rows[i], t = e.target;
  if(t.classList.contains("r-item")){
    if(t.value === CUSTOM){
      Object.assign(r, {custom:true, level:"", item:"", size:"", price:""});
    } else {
      const [level, item] = t.value.split("|");
      const sizes = CATALOG[level][item];
      const keepSize = !r.custom && sizes[r.size] != null ? r.size : Object.keys(sizes)[0];
      Object.assign(r, {custom:false, level, item, size:keepSize, price:String(sizes[keepSize])});
    }
    markDirty(); renderRows();
  } else if(t.classList.contains("r-size")){
    r.size = t.value;
    r.price = String(catalogPrice(r));          // price follows the chosen size
    markDirty(); renderRows();
  }
});
$("rows").addEventListener("click", e => {
  const b = e.target.closest(".del"); if(!b) return;
  const i = +b.closest(".orow").dataset.i;
  S.rows.splice(i, 1);
  if(S.rows.length === 0) S.rows.push(newRow());
  markDirty(); renderRows();
});
$("addRowBtn").addEventListener("click", () => {
  S.rows.push(newRow(S.rows[S.rows.length - 1]));
  markDirty(); renderRows();
  const last = $("rows").lastElementChild; if(last) last.querySelector(".r-qty").focus();
});

/* ===================== RENDER (form totals + receipt) ===================== */
function renderAll(){
  const c = calc();
  const shop = S.shop || getSettings();

  $("totQty").textContent = c.qty;
  $("fSubtotal").textContent = peso(c.sub);
  $("fTotal").textContent = peso(c.total);

  // receipt header
  $("rShopName").textContent = shop.shopName || "Receipt";
  $("rTagline").textContent = shop.tagline || "";
  $("rContact").textContent = [shop.address, shop.contact].filter(Boolean).join(" · ");

  // meta
  $("rNo").textContent = S.receiptNo || "—";
  $("rDate").textContent = fmtStamp(S.date, S.time) || "—";
  $("rCustomer").textContent = S.customer.trim();
  $("rCustomerWrap").hidden = !S.customer.trim();
  $("rClaim").textContent = fmtDate(S.claimDate);
  $("rClaimWrap").hidden = !S.claimDate;

  // items (only complete, valid rows)
  const lines = S.rows.filter(r => validQty(r.qty) && validMoney(r.price,false) && String(r.item).trim() && String(r.size).trim());
  $("rItems").innerHTML = lines.length ? lines.map(r => {
    const q = Number(r.qty), p = Number(r.price);
    return `<tr><td>${esc(r.item)}${r.level ? `<span class="sub">${esc(r.level)}</span>` : ""}</td><td>${esc(r.size)}</td>
      <td class="num">${q}</td><td class="num">${peso(p)}</td><td class="num">${peso(round2(q*p))}</td></tr>`;
  }).join("") : `<tr><td class="empty" colspan="5">No items yet</td></tr>`;
  $("rQty").textContent = c.qty;

  // summary
  $("rSub").textContent = peso(c.sub);
  $("rDiscLine").hidden = !(c.disc > 0);
  $("rDisc").textContent = "-" + peso(c.disc);
  $("rTotal").textContent = peso(c.total);
  $("rPaid").textContent = peso(c.paid);
  const change = c.paid > c.total ? round2(c.paid - c.total) : 0;
  $("rChangeLine").hidden = !(change > 0); $("rChange").textContent = peso(change);
  $("fChangeLine").hidden = !(change > 0); $("fChange").textContent = peso(change);


  $("rNotes").textContent = S.notes.trim() ? "Notes: " + S.notes.trim() : "";
}
function renderForm(){
  $("receiptNo").value = S.receiptNo;
  $("txDate").value = fmtStamp(S.date, S.time);
  $("customer").value = S.customer;
  $("claimDate").value = S.claimDate;
  $("notes").value = S.notes;
  $("discount").value = S.discount;
  $("paid").value = S.paid;
  clearErrors();
  renderRows();
  updateSaveState();
}
function updateSaveState(){
  const el = $("saveState");
  if(S.id && !dirty){ el.textContent = "Saved ✓  " + S.receiptNo; el.className = "savestate saved"; }
  else if(S.id){ el.textContent = "Unsaved changes to " + S.receiptNo; el.className = "savestate"; }
  else { el.textContent = "Not saved yet"; el.className = "savestate"; }
}

// simple text fields
[["customer","customer"],["claimDate","claimDate"],["notes","notes"],["discount","discount"],["paid","paid"]].forEach(([id, key]) => {
  $(id).addEventListener("input", () => { S[key] = $(id).value; $(id).classList.remove("invalid"); markDirty(); renderAll(); });
});

/* ===================== VALIDATION ===================== */
function clearErrors(){
  $("formErrors").hidden = true; $("formErrors").innerHTML = "";
  document.querySelectorAll(".invalid").forEach(e => e.classList.remove("invalid"));
}
function validate(){
  clearErrors();
  const errs = [];
  const rowsEl = $("rows").children;
  const flag = (i, sel) => { const x = rowsEl[i] && rowsEl[i].querySelector(sel); if(x) x.classList.add("invalid"); };

  S.rows.forEach((r, i) => {
    const n = "Item " + (i + 1) + ": ";
    if(r.custom && !String(r.item).trim()){ errs.push(n + "enter the item name."); flag(i, ".r-cname"); }
    if(r.custom && !String(r.size).trim()){ errs.push(n + "enter the size."); flag(i, ".r-csize"); }
    if(!validQty(r.qty)){ errs.push(n + "quantity must be a whole number of 1 or more (or remove the row)."); flag(i, ".r-qty"); }
    if(!validMoney(r.price, false)){ errs.push(n + "unit price must be a valid amount (0 or more, up to 2 decimals)."); flag(i, ".r-price"); }
  });
  const c = calc();
  if(c.qty === 0 && errs.length === 0) errs.push("Add at least one item with a quantity.");
  if(!validMoney(S.discount, true)){ errs.push("Discount must be a valid amount (0 or more)."); $("discount").classList.add("invalid"); }
  else if(c.disc > c.sub){ errs.push("Discount cannot be more than the subtotal."); $("discount").classList.add("invalid"); }
  if(!validMoney(S.paid, true)){ errs.push("Amount paid must be a valid amount (0 or more)."); $("paid").classList.add("invalid"); }
  if(S.claimDate && S.claimDate < S.date){ errs.push("Claim date cannot be earlier than the transaction date."); $("claimDate").classList.add("invalid"); }

  if(errs.length){
    const box = $("formErrors");
    box.innerHTML = "<b>Please fix the following:</b><ul>" + errs.map(e => `<li>${esc(e)}</li>`).join("") + "</ul>";
    box.hidden = false;
    box.scrollIntoView({behavior:"smooth", block:"nearest"});
    return false;
  }
  return true;
}

/* ===================== SAVE ===================== */
function snapshot(){
  const c = calc();
  return {
    id: S.id, receiptNo: S.receiptNo, date: S.date, time: S.time || "", claimDate: S.claimDate,
    customer: S.customer.trim(), notes: S.notes.trim(),
    items: S.rows.map(r => ({ level:r.level, item:String(r.item).trim(), size:String(r.size).trim(), qty:Number(r.qty), price:Number(r.price), custom:!!r.custom })),
    discount: c.disc, paid: c.paid, subtotal: c.sub, total: c.total, balance: c.balance,
    shop: S.shop || (({shopName,tagline,address,contact}) => ({shopName,tagline,address,contact}))(getSettings()),
    savedAt: new Date().toISOString()
  };
}
/* Returns true when the receipt is validated and stored. */
function saveCurrent(opts){
  opts = opts || {};
  if(!validate()) return false;
  if(!store.ok){ toast("Cannot save in this browser (storage blocked)"); return false; }
  const recs = getReceipts();
  const isNew = !S.id;
  if(isNew){
    Object.assign(S, nowParts());
    // make sure the number is still free (e.g. another tab saved one meanwhile)
    if(!S.receiptNo || recs.some(r => r.receiptNo === S.receiptNo)){
      const old = S.receiptNo; S.receiptNo = nextReceiptNo();
      if(old) toast("Receipt no. " + old + " was already used — now " + S.receiptNo);
    }
    S.id = newId();
    S.shop = (({shopName,tagline,address,contact}) => ({shopName,tagline,address,contact}))(getSettings());
  }
  const rec = snapshot();
  const idx = recs.findIndex(r => r.id === S.id);
  if(idx >= 0) recs[idx] = rec; else recs.unshift(rec);
  if(!putReceipts(recs)){
    if(isNew) S.id = null;
    toast("Could not save — storage is full or blocked");
    return false;
  }
  if(isNew) bumpSeq(S.receiptNo);
  dirty = false;
  $("receiptNo").value = S.receiptNo; $("txDate").value = fmtStamp(S.date, S.time);
  renderAll(); updateSaveState();
  if(!opts.quiet) toast("Receipt saved: " + S.receiptNo);
  if(!$("historyCard").hidden) renderHistory();
  return true;
}
// Print / PDF: record the receipt first so its number can never be handed out twice.
function ensureRecorded(){
  if(!validate()) return false;
  if(!store.ok) return true;                    // can still print, just not recorded
  if(S.id && !dirty) return true;
  return saveCurrent({quiet:true});
}

/* ===================== ACTIONS ===================== */
$("generateBtn").addEventListener("click", () => {
  if(!saveCurrent({quiet:true})){ if(!store.ok && validate()) toast("Receipt ready (not recorded)"); return; }
  toast("Receipt generated and saved: " + S.receiptNo);
  if(window.matchMedia("(max-width:1000px)").matches) $("receipt").scrollIntoView({behavior:"smooth", block:"start"});
});
$("saveBtn").addEventListener("click", () => saveCurrent());
$("printBtn").addEventListener("click", () => { if(ensureRecorded()) window.print(); });
$("pdfBtn").addEventListener("click", () => { if(ensureRecorded()) downloadPdf(); });
$("clearBtn").addEventListener("click", () => {
  const hasContent = dirty && (S.rows.some(r => r.qty !== "") || S.customer || S.paid || S.discount);
  if(hasContent && !confirm("Clear the form? Unsaved changes will be lost.")) return;
  newReceipt(); toast("Form cleared");
});
$("newBtn").addEventListener("click", () => {
  if(dirty && S.rows.some(r => r.qty !== "") && !confirm("Start a new receipt? Unsaved changes will be lost.")) return;
  newReceipt();
  window.scrollTo({top:0, behavior:"smooth"});
  document.querySelector(".col-form").scrollTo({top:0});   // form panel scrolls back to the top
  toast("New receipt: " + S.receiptNo);
});
// Date and time follow the clock until the receipt is saved.
setInterval(() => {
  if(S.id) return;
  const n = nowParts();
  if(n.date !== S.date || n.time !== S.time){
    Object.assign(S, n);
    $("txDate").value = fmtStamp(S.date, S.time); renderAll();
  }
}, 1000);
function newReceipt(){ S = blankState(); dirty = false; renderForm(); }

/* ===================== PDF ===================== */
async function downloadPdf(){
  if(!window.html2canvas || !window.jspdf){
    toast("PDF tools did not load (offline?). Use Print and choose “Save as PDF”.");
    return;
  }
  const btn = $("pdfBtn"), label = btn.textContent;
  btn.disabled = true; btn.textContent = "Generating…";
  // Render a fixed-width copy so the PDF looks the same on phones and desktops.
  const clone = $("receipt").cloneNode(true);
  clone.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
  clone.style.cssText = "position:fixed;left:-10000px;top:0;width:760px;max-width:none;margin:0;box-shadow:none;";
  document.body.appendChild(clone);
  try{
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await html2canvas(clone, {scale:2, backgroundColor:"#ffffff", useCORS:true});
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({unit:"pt", format:"a4"});
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 28;
    const imgW = pw - 2*m, pxPerPt = canvas.width / imgW;
    const slice = Math.floor((ph - 2*m) * pxPerPt);
    for(let y = 0, page = 0; y < canvas.height; y += slice, page++){
      const h = Math.min(slice, canvas.height - y);
      const part = document.createElement("canvas");
      part.width = canvas.width; part.height = h;
      part.getContext("2d").drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if(page > 0) pdf.addPage();
      pdf.addImage(part.toDataURL("image/png"), "PNG", m, m, imgW, h / pxPerPt);
    }
    pdf.save((S.receiptNo || "receipt") + ".pdf");
    toast("PDF downloaded");
  }catch(e){
    console.error(e);
    toast("Could not create the PDF. Use Print and choose “Save as PDF”.");
  }finally{
    clone.remove(); btn.disabled = false; btn.textContent = label;
  }
}

/* ===================== HISTORY ===================== */
function renderHistory(){
  const q = $("historySearch").value.trim().toLowerCase();
  let recs = getReceipts().sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  const total = recs.length;
  if(q) recs = recs.filter(r => (r.receiptNo || "").toLowerCase().includes(q) || (r.customer || "").toLowerCase().includes(q));
  const list = $("historyList");
  if(!recs.length){
    list.innerHTML = `<div class="empty-msg">${total ? "No receipts match your search." : "No saved receipts yet."}</div>`;
    return;
  }
  list.innerHTML = `<div class="hrow hhead"><span>Receipt no.</span><span>Date</span><span>Customer / school</span><span class="num">Total</span><span></span></div>` +
    recs.map(r => `
    <div class="hrow" data-id="${esc(r.id)}">
      <span class="no">${esc(r.receiptNo)}</span>
      <span>${esc(fmtStamp(r.date, r.time))}</span>
      <span class="cust">${esc(r.customer) || "—"}</span>
      <span class="num">${peso(r.total)}</span>
      <span class="hbtns">
        <button class="btn btn-outline btn-sm" data-act="open" type="button">Open</button>
        <button class="btn btn-outline btn-sm" data-act="print" type="button">Print</button>
        <button class="btn btn-outline btn-sm" data-act="pdf" type="button">PDF</button>
        <button class="btn btn-danger btn-sm" data-act="delete" type="button">Delete</button>
      </span>
    </div>`).join("");
}
function loadRecord(rec){
  S = {
    id: rec.id, receiptNo: rec.receiptNo, date: rec.date, time: rec.time || "", claimDate: rec.claimDate || "",
    customer: rec.customer || "", notes: rec.notes || "",
    rows: (rec.items || []).map(it => ({
      custom: !!it.custom, level: it.level || "", item: it.item, size: it.size,
      qty: String(it.qty), price: String(it.price)
    })),
    discount: rec.discount ? String(rec.discount) : "", paid: rec.paid ? String(rec.paid) : "",
    shop: rec.shop || null
  };
  // rows whose item/size no longer exist in the catalog are shown as custom so nothing is lost
  S.rows.forEach(r => { if(!r.custom && catalogPrice(r) == null){ r.custom = true; } });
  if(!S.rows.length) S.rows.push(newRow());
  dirty = false;
  renderForm();
}
function confirmLeave(){
  if(!dirty) return true;
  return confirm("You have unsaved changes. Continue and discard them?");
}
$("historyList").addEventListener("click", async e => {
  const b = e.target.closest("button[data-act]"); if(!b) return;
  const id = b.closest(".hrow").dataset.id;
  const rec = getReceipts().find(r => r.id === id); if(!rec) return;
  const act = b.dataset.act;

  if(act === "delete"){
    if(!confirm("Delete receipt " + rec.receiptNo + (rec.customer ? " (" + rec.customer + ")" : "") + "?\nThis cannot be undone.")) return;
    const left = getReceipts().filter(r => r.id !== id);
    if(!putReceipts(left)){ toast("Could not delete (storage unavailable)"); return; }
    if(S.id === id) newReceipt();
    renderHistory(); toast("Receipt deleted");
    return;
  }
  if(S.id !== id){
    if(!confirmLeave()) return;
    loadRecord(rec);
  }
  if(act === "open"){ toast("Opened " + rec.receiptNo); window.scrollTo({top:0, behavior:"smooth"}); }
  else if(act === "print"){ window.print(); }
  else if(act === "pdf"){ await downloadPdf(); }
});
$("historySearch").addEventListener("input", renderHistory);
$("historyBtn").addEventListener("click", () => {
  const c = $("historyCard"); c.hidden = !c.hidden;
  if(!c.hidden){ renderHistory(); c.scrollIntoView({behavior:"smooth", block:"start"}); }
});

/* backup / restore */
$("exportBtn").addEventListener("click", () => {
  const recs = getReceipts();
  if(!recs.length){ toast("Nothing to export yet"); return; }
  const blob = new Blob([JSON.stringify({app:"sjasq-receipts", version:1, exportedAt:new Date().toISOString(), receipts:recs}, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "sjasq-receipts-backup-" + todayLocal() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Backup downloaded (" + recs.length + " receipts)");
});
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if(!f) return;
  try{
    const data = JSON.parse(await f.text());
    const incoming = Array.isArray(data) ? data : data.receipts;
    if(!Array.isArray(incoming)) throw new Error("bad format");
    const recs = getReceipts();
    const ids = new Set(recs.map(r => r.id)), nos = new Set(recs.map(r => r.receiptNo));
    let added = 0, skipped = 0;
    incoming.forEach(r => {
      const ok = r && r.id && r.receiptNo && Array.isArray(r.items) && !isNaN(Number(r.total));
      if(!ok || ids.has(r.id) || nos.has(r.receiptNo)){ skipped++; return; }
      recs.push(r); ids.add(r.id); nos.add(r.receiptNo); bumpSeq(r.receiptNo); added++;
    });
    if(added && !putReceipts(recs)){ toast("Could not import (storage unavailable)"); return; }
    if(!S.id) { S.receiptNo = nextReceiptNo(); $("receiptNo").value = S.receiptNo; renderAll(); }
    renderHistory();
    toast("Imported " + added + (skipped ? ", skipped " + skipped + " duplicate/invalid" : ""));
  }catch(err){
    toast("That file is not a valid backup");
  }
});

/* ===================== ADMIN MODE (price changes + settings) ===================== */
function askPin(){
  return new Promise(resolve => {
    const dlg = $("pinDialog"), input = $("pinInput"), err = $("pinErr");
    input.value = ""; err.hidden = true;
    const done = v => { dlg.removeEventListener("close", onClose); $("pinForm").onsubmit = null; $("pinCancel").onclick = null; resolve(v); };
    const onClose = () => done(false);
    $("pinForm").onsubmit = ev => {
      ev.preventDefault();
      if(input.value === getSettings().pin){ dlg.removeEventListener("close", onClose); dlg.close(); done(true); }
      else { err.hidden = false; input.select(); }
    };
    $("pinCancel").onclick = () => dlg.close();
    dlg.addEventListener("close", onClose);
    dlg.showModal(); input.focus();
  });
}
function applyAdmin(){
  $("adminBtn").textContent = admin ? "🔓 Admin: ON" : "🔒 Admin";
  $("settingsCard").hidden = !admin;
  $("priceHint").textContent = admin
    ? "Admin mode: unit prices can be changed. Adjusted prices are highlighted in gold."
    : "Prices fill in automatically. To change a price, unlock Admin mode (top right).";
  if(admin){
    const s = getSettings();
    $("setName").value = s.shopName; $("setTagline").value = s.tagline; $("setAddress").value = s.address; $("setContact").value = s.contact; $("setPin").value = "";
  }
  renderRows();
}
$("adminBtn").addEventListener("click", async () => {
  if(admin){ admin = false; applyAdmin(); toast("Admin mode locked"); return; }
  if(await askPin()){ admin = true; applyAdmin(); toast("Admin mode unlocked"); }
});
$("saveSettingsBtn").addEventListener("click", () => {
  const s = getSettings();
  const name = $("setName").value.trim();
  if(!name){ toast("Shop name is required"); $("setName").classList.add("invalid"); return; }
  $("setName").classList.remove("invalid");
  const pin = $("setPin").value.trim();
  if(pin && !/^\d{4,12}$/.test(pin)){ toast("PIN must be 4–12 digits"); $("setPin").classList.add("invalid"); return; }
  $("setPin").classList.remove("invalid");
  const next = { shopName:name, tagline:$("setTagline").value.trim(), address:$("setAddress").value.trim(), contact:$("setContact").value.trim(), pin: pin || s.pin };
  if(!store.write(SETTINGS_KEY, next)){ toast("Could not save settings (storage unavailable)"); return; }
  if(!S.id) S.shop = null;       // unsaved receipt follows the new settings; saved ones keep their own
  $("setPin").value = "";
  renderAll(); toast(pin ? "Settings and PIN saved" : "Settings saved");
});

/* ===================== INIT ===================== */
function init(){
  if(!store.test()) $("storageWarn").hidden = false;
  S = blankState();
  renderForm();
}
window.addEventListener("beforeunload", e => { if(dirty && S.rows.some(r => r.qty !== "")){ e.preventDefault(); e.returnValue = ""; } });
init();
