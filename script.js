// App config
const ADMIN = {user: "admin", pass: "1234"};
const USER = {user: "user", pass: "1234"};
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyLAsIqjBPtOFxcev1jflFNwDRzMyB7E_2hJTBCkYkQUzvb699PqcCm8Vl4Uo6SRaQH/exec";
const PLANTS = ["BKD","KSN","BP","Neotech","SWI","BKS","BLN","KRR","CYY","UBS","ETL","SMS","WGC","DOMESTICS"];
const FLATBED_TYPES_1SLOT = ["JB on pallet","LOCALFlatbed","Product&Pallet return to Plant","LOCAL 4W-6W","Consumabels"];
const FLATBED_TYPES_2SLOT = ["JB looseload","JB looseload+change tag"];
const SLOT_BREAKS = ["00:00","11:00"];
const SLOT_BREAK_ENDS = ["01:00","12:00"];
const SUNDAY = 0;
const MAX_BOOK_DAYS_AHEAD = 7;

let userRole = null;

// Login
document.getElementById('login-btn').onclick = function() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  if (user === ADMIN.user && pass === ADMIN.pass) {
    userRole = "admin";
    afterLogin();
  } else if (user === USER.user && pass === USER.pass) {
    userRole = "user";
    afterLogin();
  } else {
    document.getElementById('login-error').innerText = "Username หรือ Password ไม่ถูกต้อง";
  }
};
function afterLogin() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('main-app').style.display = '';
  // hide dashboard for user role
  if (userRole === "user") {
    document.querySelector('[data-section="dashboard-section"]').style.display = "none";
  }
  document.getElementById('logout-btn').onclick = () => location.reload();
  setupNav();
  initBooking();
  initDashboard();
  initProduct();
}

// Navigation
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = function() {
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      let sec = btn.getAttribute('data-section');
      document.querySelectorAll('section').forEach(s => s.style.display = 'none');
      document.getElementById(sec).style.display = '';
    }
  });
}

// Utility
function toHHMM(hour) {
  return (hour<10?'0':'')+hour+":00";
}
function plus1h(timeStr) {
  let [h, m] = timeStr.split(':').map(Number);
  h = (h+1)%24;
  return (h<10?'0':'')+h+":00";
}
function dateToInput(d) {
  return d.toISOString().split('T')[0];
}
function getToday() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}
function isBreakSlot(hhmm) {
  return SLOT_BREAKS.some((start,idx) => {
    let end = SLOT_BREAK_ENDS[idx];
    return hhmm >= start && hhmm < end;
  });
}
function isSunday(dateStr) {
  let d = new Date(dateStr);
  return d.getDay() === SUNDAY;
}

// ================ Booking Section =====================
let bookings = [];
function initBooking() {
  // Default date = today
  let bookingDate = getToday();
  document.getElementById('booking-date').value = dateToInput(bookingDate);
  document.getElementById('booking-date').min = dateToInput(bookingDate);
  document.getElementById('booking-date').max = dateToInput(new Date(bookingDate.getTime() + MAX_BOOK_DAYS_AHEAD*24*60*60*1000));
  document.getElementById('booking-date').onchange = renderSlotGrid;
  renderSlotGrid();
}
function renderSlotGrid() {
  let dateStr = document.getElementById('booking-date').value;
  if (!dateStr) return;
  // Check Sunday
  if(isSunday(dateStr)) {
    document.getElementById('slot-grid').innerHTML = '<div style="color:#e53e3e;grid-column:1/-1;padding:1em;text-align:center">ไม่สามารถจองคิวในวันอาทิตย์ได้</div>';
    return;
  }
  fetchBookings(dateStr, (bookingsForDate) => {
    let html = '';
    for (let h=0; h<24; h++) {
      let hhmm = toHHMM(h);
      let slotId = dateStr+'_'+hhmm;
      // Break slot
      if (isBreakSlot(hhmm)) {
        html += `
          <div class="slot break">
            <div class="car"></div>
            <div class="status">เวลาพักเบรก</div>
            <div>${hhmm}-${plus1h(hhmm)}</div>
          </div>`;
        continue;
      }
      // Booked?
      let book = bookingsForDate.find(b=>b.slotTime===hhmm);
      if (book) {
        html += `
          <div class="slot booked">
            <div class="car"></div>
            <div class="plate">${book.plate||''}</div>
            <div class="status">${book.status||'จองแล้ว'}</div>
            <div>${hhmm}-${plus1h(hhmm)}</div>
          </div>`;
        continue;
      }
      // Available
      html += `
        <div class="slot available" data-slot="${hhmm}">
          <div class="car"></div>
          <div class="status">ว่าง</div>
          <div>${hhmm}-${plus1h(hhmm)}</div>
        </div>`;
    }
    document.getElementById('slot-grid').innerHTML = html;
    document.querySelectorAll('.slot.available').forEach(slot => {
      slot.onclick = () => openBookingModal(dateStr, slot.getAttribute('data-slot'));
    });
  });
}
function fetchBookings(dateStr, cb) {
  // ดึงข้อมูลจาก Google Sheet (API Google Apps Script)
  fetch(GOOGLE_SCRIPT_URL+'?date='+dateStr)
    .then(res=>res.json())
    .then(data=>{
      bookings = Array.isArray(data)?data:[];
      // filter เฉพาะวัน
      let b = bookings.filter(b=>b.date===dateStr);
      cb(b);
    })
    .catch(_=>{
      bookings = [];
      cb([]);
    });
}
let bookingSlot = null;
let bookingDate = null;
function openBookingModal(date, slot) {
  bookingSlot = slot;
  bookingDate = date;
  document.getElementById('selected-slot').value = slot;
  document.getElementById('selected-date').value = date;
  document.getElementById('booking-form').reset();
  // Clear material rows
  document.getElementById('material-tbody').innerHTML = '';
  addMaterialRow();
  document.getElementById('booking-form-error').innerText = '';
  document.getElementById('booking-modal').style.display = 'block';
}
document.getElementById('close-modal').onclick = () => {
  document.getElementById('booking-modal').style.display = 'none';
};

document.getElementById('add-material').onclick = addMaterialRow;
function addMaterialRow() {
  let tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="material" required></td>
    <td><input type="text" class="batch" required></td>
    <td><input type="number" class="qty" min="1" required></td>
    <td><input type="number" class="ton" min="0" step="0.01" required></td>
    <td><button type="button" class="remove-material" title="ลบแถว">-</button></td>
  `;
  tr.querySelector('.remove-material').onclick = function() {
    tr.parentElement.removeChild(tr);
  };
  document.getElementById('material-tbody').appendChild(tr);
}

document.getElementById('flatbed').onchange = function() {
  // Highlight rule
  // JB looseload, JB looseload+change tag = 2 slot
  // others = 1 slot
};

document.getElementById('booking-form').onsubmit = function(e) {
  e.preventDefault();
  const name = document.getElementById('name').value.trim();
  const plate = document.getElementById('plate').value.trim();
  const plant = document.getElementById('plant').value;
  const phone = document.getElementById('phone').value.trim();
  const flatbed = document.getElementById('flatbed').value;
  const slotTime = document.getElementById('selected-slot').value;
  const date = document.getElementById('selected-date').value;
  // Validation
  if (!name || !plate || !plant || !phone || !flatbed) {
    document.getElementById('booking-form-error').innerText = "กรุณากรอกข้อมูลให้ครบถ้วน";
    return;
  }
  // Check slot rule
  let slotCount = FLATBED_TYPES_2SLOT.includes(flatbed) ? 2 : 1;
  // ตรวจสอบ slot ว่าง
  fetchBookings(date, (books) => {
    let idx = parseInt(slotTime.split(':')[0]);
    let ok = true;
    for(let i=0;i<slotCount;i++) {
      let checkSlot = toHHMM(idx+i);
      if (isBreakSlot(checkSlot)) { ok = false; break; }
      if (books.some(b=>b.slotTime === checkSlot)) { ok = false; break; }
    }
    if (!ok) {
      document.getElementById('booking-form-error').innerText = "ช่วงเวลานี้ถูกจอง หรือเป็นเวลาพักเบรก/ไม่สามารถจองได้";
      return;
    }
    // Collect materials
    let materials = [];
    document.querySelectorAll('#material-tbody tr').forEach(tr => {
      let m = tr.querySelector('.material').value.trim();
      let b = tr.querySelector('.batch').value.trim();
      let q = tr.querySelector('.qty').value;
      let t = tr.querySelector('.ton').value;
      if (m && b && q && t) {
        materials.push({material: m, batch: b, qty: q, ton: t});
      }
    });
    if(materials.length === 0) {
      document.getElementById('booking-form-error').innerText = "กรุณาเพิ่มรายการ Material อย่างน้อย 1 รายการ";
      return;
    }
    // Prepare data
    const data = {
      name, plate, plant, phone, flatbed, date, slotTime, slotCount,
      status: "กำลังขึ้นสินค้า",
      materials: JSON.stringify(materials)
    };
    // ส่งไป Google Script
    fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    })
    .then(res=>res.json())
    .then(resp=>{
      if(resp.result === "success") {
        document.getElementById('booking-modal').style.display = 'none';
        renderSlotGrid();
        alert("จองคิวสำเร็จ");
      } else {
        document.getElementById('booking-form-error').innerText = "เกิดข้อผิดพลาด กรุณาลองใหม่";
      }
    }).catch(_=>{
      document.getElementById('booking-form-error').innerText = "เกิดข้อผิดพลาดในการเชื่อมต่อ";
    });
  });
};

// ================ Dashboard Section =====================
function initDashboard() {
  document.getElementById('dashboard-date').value = dateToInput(getToday());
  document.getElementById('dashboard-view').onchange = renderDashboard;
  document.getElementById('dashboard-date').onchange = renderDashboard;
  document.getElementById('export-excel').onclick = exportExcel;
  renderDashboard();
}
function renderDashboard() {
  let view = document.getElementById('dashboard-view').value;
  let date = document.getElementById('dashboard-date').value;
  fetch(GOOGLE_SCRIPT_URL+'?all=1')
    .then(res=>res.json())
    .then(data=>{
      let all = Array.isArray(data)?data:[]; // All bookings
      // Filter by view
      let filtered = [];
      if(view === "daily") {
        filtered = all.filter(b=>b.date===date);
      } else if (view === "weekly") {
        let d = new Date(date);
        let weekStart = new Date(d.setDate(d.getDate() - d.getDay() + 1)); // Monday
        let weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate()+6);
        filtered = all.filter(b=>{
          let bd = new Date(b.date);
          return bd >= weekStart && bd <= weekEnd;
        });
      } else if (view === "monthly") {
        let [yyyy, mm] = date.split('-');
        filtered = all.filter(b=>b.date.startsWith(yyyy+"-"+mm));
      }
      // สรุปกราฟ
      let statusCount = {};
      ["กำลังขึ้นสินค้า","กำลังเดินทาง","ถึงปลายทาง","เข้าลงสินค้า","เสร็จสิ้น"].forEach(s=>statusCount[s]=0);
      filtered.forEach(b=>statusCount[b.status] = (statusCount[b.status]||0)+1);
      dashboardChart(statusCount);
      // summary (แบบตาราง)
      document.getElementById('dashboard-summary').innerHTML = 
        `<table class="summary-table">
          <tr>
            <th>กำลังขึ้นสินค้า</th>
            <th>กำลังเดินทาง</th>
            <th>ถึงปลายทาง</th>
            <th>เข้าลงสินค้า</th>
            <th>เสร็จสิ้น</th>
          </tr>
          <tr>
            <td>${statusCount["กำลังขึ้นสินค้า"]}</td>
            <td>${statusCount["กำลังเดินทาง"]}</td>
            <td>${statusCount["ถึงปลายทาง"]}</td>
            <td>${statusCount["เข้าลงสินค้า"]}</td>
            <td>${statusCount["เสร็จสิ้น"]}</td>
          </tr>
        </table>
        <b>จำนวนคิวทั้งหมด:</b> ${filtered.length}`;
      // Table
      let rows = filtered.map((b,i) => `
        <tr>
          <td>${i+1}</td>
          <td>${b.date||''} ${b.slotTime||''}</td>
          <td>${b.name||''}</td>
          <td>${b.plate||''}</td>
          <td>${b.plant||''}</td>
          <td>${b.flatbed||''}</td>
          <td>${b.status||''}</td>
          <td>
            <button class="dashboard-action" onclick="editBooking('${b.id||''}')">แก้ไข</button>
            <button class="dashboard-action cancel" onclick="cancelBooking('${b.id||''}')">ยกเลิก</button>
            <button class="dashboard-action move" onclick="moveBooking('${b.id||''}')">เลื่อนคิว</button>
          </td>
        </tr>
      `).join('');
      document.getElementById('dashboard-table').innerHTML = `
        <table>
          <thead>
            <tr>
              <th>#</th><th>วัน/เวลา</th><th>ชื่อผู้จอง</th><th>ทะเบียน</th><th>Plant</th>
              <th>Flatbed Type</th><th>สถานะ</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    });
}
let chartObj = null;
function dashboardChart(stat) {
  const ctxID = 'dashboardChartCanvas';
  let c = document.getElementById(ctxID);
  if(c) c.remove();
  c = document.createElement('canvas');
  c.id = ctxID;
  document.getElementById('dashboard-chart').innerHTML = '';
  document.getElementById('dashboard-chart').appendChild(c);
  chartObj = new Chart(c, {
    type: 'bar',
    data: {
      labels: Object.keys(stat),
      datasets: [{
        label: 'จำนวนคิว',
        data: Object.values(stat),
        backgroundColor: Object.keys(stat).map(s=>s==="เสร็จสิ้น"?"#126c2a":"#19ae3d")
      }]
    },
    options: {
      plugins: {legend: {display:false}},
      responsive:true,
      scales:{y:{beginAtZero:true}}
    }
  });
}
function exportExcel() {
  // ดึงข้อมูล Filtered แล้วสร้างเป็น CSV
  fetch(GOOGLE_SCRIPT_URL+'?all=1')
    .then(res=>res.json())
    .then(data=>{
      // หัวตารางภาษาไทย
      let csv = "วันที่,เวลา,ชื่อผู้จอง,ทะเบียนรถ,Plant,ประเภท,สถานะ,Material,เบอร์โทรศัพท์\n";
      data.forEach(b=>{
        // ดึง Material เป็นข้อความอ่านง่าย
        let materialText = "";
        try {
          let mats = JSON.parse(b.materials || "[]");
          materialText = mats.map(m=>`ชื่อ:${m.material} Batch:${m.batch} Qty:${m.qty} Ton:${m.ton}`).join(" | ");
        } catch(e) {}
        csv += [
          b.date||'',b.slotTime||'',b.name||'',b.plate||'',b.plant||'',b.flatbed||'',b.status||'',materialText,b.phone||''
        ].map(x=>`"${x}"`).join(',') + '\n';
      });
      // ทำให้เป็น UTF-8 BOM สำหรับ Excel
      const blob = new Blob(["\uFEFF" + csv],{type:"text/csv;charset=utf-8;"});
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'booking_export.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    });
}

// Dummy functions for edit/cancel/move (implement with Google Script as needed)
window.editBooking = function(id) {
  alert("ฟีเจอร์แก้ไข ยังไม่ได้เชื่อมต่อ API (โปรดเพิ่มใน Google Script)");
};
window.cancelBooking = function(id) {
  if(confirm("ยืนยันยกเลิกการจอง?")) {
    fetch(GOOGLE_SCRIPT_URL+"?cancel="+id)
    .then(res=>res.json()).then(_=>renderDashboard());
  }
};
window.moveBooking = function(id) {
  alert("ฟีเจอร์เลื่อนคิว ยังไม่ได้เชื่อมต่อ API (โปรดเพิ่มใน Google Script)");
};

// ================ Product Section =====================
function initProduct() {
  document.getElementById('product-date').value = dateToInput(getToday());
  document.getElementById('product-date').onchange = renderProductTable;
  renderProductTable();
}
function renderProductTable() {
  let date = document.getElementById('product-date').value;
  fetch(GOOGLE_SCRIPT_URL+'?date='+date)
    .then(res=>res.json())
    .then(data=>{
      let rows = [];
      data.forEach(b=>{
        let materials;
        try{ materials = JSON.parse(b.materials); }catch(_){materials=[];}
        materials.forEach(m=>{
          rows.push(`<tr>
            <td>${b.plate||''}</td>
            <td>${b.plant||''}</td>
            <td>${m.material||''}</td>
            <td>${b.flatbed||''}</td>
            <td>${m.batch||''}</td>
            <td>${m.qty||''}</td>
            <td>${m.ton||''}</td>
          </tr>`);
        });
      });
      document.getElementById('product-table').innerHTML = `
        <table>
          <thead>
            <tr>
              <th>ทะเบียนรถ</th><th>Plant</th><th>ชื่อสินค้า</th><th>ประเภท</th><th>Batch</th><th>จำนวน</th><th>น้ำหนัก</th>
            </tr>
          </thead>
          <tbody>
            ${rows.join('')}
          </tbody>
        </table>
      `;
    });
}

// =================== END ===================