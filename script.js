/* ================================================================
   JAVASCRIPT LOGIC
   ออกแบบโดยแยกเป็น Module เพื่อความง่ายในการดูแลรักษา
   ================================================================
*/

// --- DATA MANAGER (จำลอง Database ผ่าน LocalStorage) ---
const DataManager = {
  init() {
    if (!localStorage.getItem("p2r_schedules")) {
      const defaultSchedule = {
        id: Date.now().toString(),
        name: "ตารางหลักของฉัน",
        sessions: [], // { day, subject, start, end }
      };
      localStorage.setItem("p2r_schedules", JSON.stringify([defaultSchedule]));
      localStorage.setItem("p2r_currentScheduleId", defaultSchedule.id);
    }
    if (!localStorage.getItem("p2r_community")) {
      localStorage.setItem("p2r_community", JSON.stringify([]));
    }
    if (!localStorage.getItem("p2r_posts")) {
      localStorage.setItem("p2r_posts", JSON.stringify([]));
    }
  },

  getSchedules() {
    return JSON.parse(localStorage.getItem("p2r_schedules"));
  },

  getCurrentScheduleId() {
    return localStorage.getItem("p2r_currentScheduleId");
  },

  setCurrentScheduleId(id) {
    localStorage.setItem("p2r_currentScheduleId", id);
  },

  saveSchedule(schedule) {
    const schedules = this.getSchedules();
    const index = schedules.findIndex((s) => s.id === schedule.id);
    if (index >= 0) {
      schedules[index] = schedule;
    } else {
      schedules.push(schedule);
    }
    localStorage.setItem("p2r_schedules", JSON.stringify(schedules));
  },

  addSchedule(newSchedule) {
    const schedules = this.getSchedules();
    schedules.push(newSchedule);
    localStorage.setItem("p2r_schedules", JSON.stringify(schedules));
    return newSchedule.id;
  },

  deleteSchedule(id) {
    let schedules = this.getSchedules();
    schedules = schedules.filter((s) => s.id !== id);
    localStorage.setItem("p2r_schedules", JSON.stringify(schedules));
    return schedules;
  },

  // Future: Replace this with fetch() to Google Script
  getCommunitySchedules() {
    return JSON.parse(localStorage.getItem("p2r_community"));
  },

  shareScheduleToCommunity(schedule) {
    const community = this.getCommunitySchedules();
    // Check duplicate ID
    const exists = community.find((s) => s.id === schedule.id);
    if (!exists) {
      community.push(schedule);
      localStorage.setItem("p2r_community", JSON.stringify(community));
      return true;
    }
    return false;
  },

  getPosts() {
    return JSON.parse(localStorage.getItem("p2r_posts")).sort(
      (a, b) => b.timestamp - a.timestamp,
    );
  },

  addPost(post) {
    const posts = this.getPosts();
    posts.push(post);
    localStorage.setItem("p2r_posts", JSON.stringify(posts));
  },
};

// --- APP STATE ---
let currentSchedule = null;
let selectedDay = null; // 'Monday', 'Tuesday', ...
const daysOfWeek = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// --- ROUTING (Single Page App Logic) ---
function router(pageId) {
  // Hide all sections
  document
    .querySelectorAll(".section")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll(".nav-links button")
    .forEach((el) => el.classList.remove("active"));

  // Show selected
  document.getElementById(pageId).classList.add("active");
  document.getElementById("nav-" + pageId).classList.add("active");

  // Trigger Inits
  if (pageId === "planner") initPlanner();
  if (pageId === "community") loadCommunity();
  if (pageId === "discussion") loadDiscussions();
}

// --- PLANNER LOGIC ---
function initPlanner() {
  const schedules = DataManager.getSchedules();
  const currentId = DataManager.getCurrentScheduleId();

  // Populate Dropdown
  const selector = document.getElementById("scheduleSelector");
  if (selector) {
    selector.innerHTML = "";
    schedules.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.text = s.name;
      opt.selected = s.id === currentId;
      selector.appendChild(opt);
    });
  }

  loadSchedule(currentId);
}

function loadSchedule(id) {
  DataManager.setCurrentScheduleId(id);
  const schedules = DataManager.getSchedules();
  currentSchedule = schedules.find((s) => s.id === id);

  renderWeeklyGrid();
  showWeeklyView(); // Reset view
}

function createNewSchedule() {
  const name = prompt("ตั้งชื่อตารางใหม่ของคุณ:");
  if (name) {
    const newSch = {
      id: Date.now().toString(),
      name: name,
      sessions: [],
    };
    DataManager.addSchedule(newSch);
    initPlanner(); // Reload dropdown
    loadSchedule(newSch.id);
  }
}

function deleteCurrentSchedule() {
  const schedules = DataManager.getSchedules();
  if (schedules.length <= 1) {
    alert(" ไม่สามารถลบตารางสุดท้ายได้ คุณต้องมีอย่างน้อยหนึ่งตาราง");
    return;
  }

  if (confirm(`ยืนยันการลบตาราง "${currentSchedule.name}"?`)) {
    const remaining = DataManager.deleteSchedule(currentSchedule.id);
    // Switch to the first remaining schedule
    DataManager.setCurrentScheduleId(remaining[0].id);
    initPlanner();
    alert("ลบบันทึกตารางเรียบร้อยแล้ว");
  }
}

function renderWeeklyGrid() {
  const grid = document.getElementById("weeklyView");
  if (!grid) return;
  grid.innerHTML = "";

  daysOfWeek.forEach((day) => {
    // Count tasks
    const taskCount = currentSchedule.sessions.filter(
      (s) => s.day === day,
    ).length;

    const card = document.createElement("div");
    card.className = "day-card";
    card.innerHTML = `<h3>${day}</h3><p>${taskCount} วิชา</p>`;
    card.onclick = () => openDailyView(day);
    grid.appendChild(card);
  });
}

function openDailyView(day) {
  selectedDay = day;
  document.getElementById("weeklyView").style.display = "none";
  document.getElementById("dailyView").style.display = "block";
  document.getElementById("currentDayTitle").innerText = `📅 ${day}`;
  renderDailyTimeline();
}

function showWeeklyView() {
  const weeklyView = document.getElementById("weeklyView");
  const dailyView = document.getElementById("dailyView");
  if (weeklyView) weeklyView.style.display = "grid";
  if (dailyView) dailyView.style.display = "none";
  renderWeeklyGrid(); // Refresh counts
}

// --- THEME MANAGER ---
const ThemeManager = {
  init() {
    const savedTheme = localStorage.getItem("p2r_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    this.updateToggleButton(savedTheme);
  },

  toggle() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("p2r_theme", newTheme);
    this.updateToggleButton(newTheme);
  },

  updateToggleButton(theme) {
    const btn = document.getElementById("themeToggle");
    if (btn) {
      btn.innerText = theme === "dark" ? "☀️" : "🌙";
    }
  },
};

function toggleTheme() {
  ThemeManager.toggle();
}

// --- INITIALIZATION ---
window.onload = function () {
  DataManager.init();
  ThemeManager.init();
  initPlanner(); // Start at Planner

  // Listen to select change
  const timerSelect = document.getElementById("timerSelect");
  if (timerSelect) {
    timerSelect.addEventListener("change", function () {
      if (!isRunning) resetTimer();
    });
  }

  // Close modal when clicking outside
  window.onclick = function (event) {
    if (event.target == document.getElementById("addEventModal")) {
      closeAddModal();
    }
  };
};

// --- Update deleteEvent for better UI ---
function deleteEvent(id) {
  // Use a smoother confirmation or just confirm
  if (confirm("ยืนยันการลบกิจกรรมนี้?")) {
    currentSchedule.sessions = currentSchedule.sessions.filter(
      (s) => s.id !== id,
    );
    DataManager.saveSchedule(currentSchedule);
    renderDailyTimeline();
  }
}

// Update renderDailyTimeline to use better buttons
function renderDailyTimeline() {
  const container = document.getElementById("timelineContainer");
  if (!container) return;
  container.innerHTML = "";

  const dailyEvents = currentSchedule.sessions
    .filter((s) => s.day === selectedDay)
    .sort((a, b) => a.start.localeCompare(b.start));

  if (dailyEvents.length === 0) {
    container.innerHTML =
      '<p style="text-align:center; color:var(--text-secondary); margin: 2rem 0;">ยังไม่มีรายการอ่านหนังสือวันนี้</p>';
    return;
  }

  dailyEvents.forEach((evt) => {
    const el = document.createElement("div");
    el.className = "timeline-item";
    el.innerHTML = `
            <div>
                <div style="font-weight:700; font-size:1.1rem; color:var(--text-primary);">${evt.subject}</div>
                <div style="font-size:0.9rem; color:var(--text-secondary);">${evt.start} - ${evt.end}</div>
            </div>
            <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="deleteEvent('${evt.id}')">ลบ</button>
        `;
    container.appendChild(el);
  });
}

// --- OVERLAP & ADD LOGIC ---
function openAddModal() {
  document.getElementById("addEventModal").style.display = "flex";
  document.getElementById("evtSubject").value = "";
  document.getElementById("evtStart").value = "";
  document.getElementById("evtEnd").value = "";
}

function closeAddModal() {
  document.getElementById("addEventModal").style.display = "none";
}

function saveEvent() {
  const subject = document.getElementById("evtSubject").value;
  const start = document.getElementById("evtStart").value;
  const end = document.getElementById("evtEnd").value;

  if (!subject || !start || !end) {
    alert("กรุณากรอกข้อมูลให้ครบถ้วน");
    return;
  }

  // Convert to minutes for robust comparison
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startTotal = startH * 60 + startM;
  const endTotal = endH * 60 + endM;

  if (startTotal >= endTotal) {
    alert("เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด");
    return;
  }

  // Check Overlap
  const isOverlap = currentSchedule.sessions.some((s) => {
    if (s.day !== selectedDay) return false;
    // Logic: (StartA < EndB) and (EndA > StartB)
    return start < s.end && end > s.start;
  });

  if (isOverlap) {
    alert("⚠️ เวลาซ้อนทับกับวิชาอื่น กรุณาตรวจสอบเวลา");
    return;
  }

  // Add Event
  currentSchedule.sessions.push({
    id: Date.now().toString(),
    day: selectedDay,
    subject,
    start,
    end,
  });

  DataManager.saveSchedule(currentSchedule);
  closeAddModal();
  renderDailyTimeline();
}

// --- COMMUNITY LOGIC ---
function shareCurrentSchedule() {
  if (!currentSchedule) return;
  // Create a Deep Copy to avoid reference issues
  const sharedVer = JSON.parse(JSON.stringify(currentSchedule));
  sharedVer.id = "shared_" + Date.now(); // New ID for shared version
  sharedVer.name = currentSchedule.name + " (Shared)";

  if (DataManager.shareScheduleToCommunity(sharedVer)) {
    alert("แชร์ตารางเรียบร้อยแล้ว!");
    loadCommunity();
  } else {
    alert("ตารางนี้ถูกแชร์ไปแล้ว");
  }
}

function loadCommunity() {
  const list = document.getElementById("communityList");
  if (!list) return;
  const commData = DataManager.getCommunitySchedules();
  list.innerHTML = "";

  if (commData.length === 0) {
    list.innerHTML = "<p style='text-align:center; color:var(--text-secondary); margin:2rem 0;'>ยังไม่มีตารางที่แชร์มา</p>";
    return;
  }

  commData.forEach((sch) => {
    const el = document.createElement("div");
    el.className = "card glass";
    el.style.display = "flex";
    el.style.justifyContent = "space-between";
    el.style.alignItems = "center";
    el.style.padding = "1.5rem";
    el.innerHTML = `
            <div>
                <h3 style="margin:0;">${sch.name}</h3>
                <p style="margin:0; color:var(--text-secondary);">${sch.sessions.length} กิจกรรม</p>
            </div>
            <button class="btn" onclick="copySchedule('${sch.id}')">นำไปใช้</button>
        `;
    list.appendChild(el);
  });
}

function copySchedule(sharedId) {
  const commData = DataManager.getCommunitySchedules();
  const target = commData.find((s) => s.id === sharedId);
  if (target) {
    const myCopy = JSON.parse(JSON.stringify(target));
    myCopy.id = "copy_" + Date.now();
    myCopy.name = "Copy of " + target.name;

    DataManager.addSchedule(myCopy);
    alert("คัดลอกตารางเรียบร้อย! ไปที่หน้า 'ตารางของฉัน' เพื่อดูได้เลย");
  }
}

// --- TIMER LOGIC ---
let timerInterval;
let timeLeft = 25 * 60;
let isRunning = false;

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const display = document.getElementById("timerDisplay");
  if (display) {
    display.innerText = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;

  timerInterval = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      updateTimerDisplay();
    } else {
      clearInterval(timerInterval);
      isRunning = false;
      alert("⏰ หมดเวลาอ่านหนังสือแล้ว! พักผ่อนสายตาเถอะ");
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval);
  isRunning = false;
}

function resetTimer() {
  pauseTimer();
  const timerSelect = document.getElementById("timerSelect");
  if (timerSelect) {
    const min = parseInt(timerSelect.value);
    timeLeft = min * 60;
  }
  updateTimerDisplay();
}

// --- DISCUSSION LOGIC ---
function createPost() {
  const title = document.getElementById("postTitle").value;
  const category = document.getElementById("postCategory").value;
  const content = document.getElementById("postContent").value;

  if (!title || !content) {
    alert("กรุณากรอกข้อมูลให้ครบ");
    return;
  }

  const post = {
    id: Date.now(),
    title,
    category,
    content,
    timestamp: Date.now(),
    comments: [],
  };

  DataManager.addPost(post);

  // Clear inputs
  document.getElementById("postTitle").value = "";
  document.getElementById("postContent").value = "";

  loadDiscussions();
}

function loadDiscussions() {
  const feed = document.getElementById("discussionFeed");
  if (!feed) return;
  const posts = DataManager.getPosts();
  feed.innerHTML = "";

  if (posts.length === 0) {
    feed.innerHTML = "<p style='text-align:center; color:var(--text-secondary); margin:2rem 0;'>ยังไม่มีโพสต์พูดคุย</p>";
    return;
  }

  posts.forEach((p) => {
    const date = new Date(p.timestamp).toLocaleString("th-TH");
    const div = document.createElement("div");
    div.className = "card glass post-item";
    div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items: center; margin-bottom: 1rem;">
                <span class="tag">${p.category}</span>
                <span class="post-meta">${date}</span>
            </div>
            <h3 style="margin-bottom: 0.5rem;">${p.title}</h3>
            <p style="color: var(--text-secondary); margin: 0;">${p.content}</p>
        `;
    feed.appendChild(div);
  });
}
