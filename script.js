/* ================================================================
   JAVASCRIPT LOGIC
   Designed to work with Google Apps Script Backend
   ================================================================
*/

// --- CONFIGURATION ---
// ใส่ Link ที่ได้จาก Deploy ที่นี่ เพื่อให้ทำงานแบบ Local ได้ (Optional)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby1LvX_rQPsjLnkU2tEj9Do7BYg3t99sh_lZzoZJ3AVaNRgf0Ycxl_NezS5pHRLc5gWYg/exec";

// --- USER IDENTITY (Simple implementation) ---
function getUserId() {
  let userId = localStorage.getItem("p2r_userId");
  if (!userId) {
    userId = "user_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("p2r_userId", userId);
  }
  return userId;
}

// --- GAS API HELPER (Promise Wrapper & Remote Fetch & Local Mock) ---
const Server = {
  call(funcName, data = {}) {
    return new Promise((resolve, reject) => {
      
      // 1. Try google.script.run (Production / Embedded)
      if (typeof google !== 'undefined' && google.script) {
          google.script.run
            .withSuccessHandler((response) => {
              if (response && response.status === 'error') {
                console.error("Server Error:", response.message);
                reject(response.message);
              } else {
                resolve(response);
              }
            })
            .withFailureHandler((error) => {
              console.error("GAS Failure:", error);
              reject(error);
            })
            [funcName](data);
          return;
      }

      // 2. If valid URL, try fetch (Local Testing against Real Backend)
      if (APPS_SCRIPT_URL && APPS_SCRIPT_URL.startsWith("http")) {
          // Convert function+data to URL parameters or Post Body
          // Simplest for this setup: sending everything as POST
          // Because doPost in appscript handles 'action' via body
          
          fetch(APPS_SCRIPT_URL, {
              method: 'POST',
              mode: 'no-cors', // Apps Script issues with CORS -> This makes it opaque.
              // WARNING: 'no-cors' means we CANNOT read the response body.
              // Accessing GAS Web App from fetch has CORS issues unless we use text/plain.
              // Let's try redirect: follow
              headers: {
                  'Content-Type': 'text/plain;charset=utf-8', 
              },
              body: JSON.stringify({ ...data, action: getActionName(funcName) })
          })
          .then(resp => {
             // CORS Limit: We usually can't read response from GAS Web App in browser fetch 
             // unless we use a proxy or JSONP.
             // So actually, fetch directly to GAS from random localhost usually FAILS to read data.
             // We will fall back to Mock if fetch is hard to implement without proxy.
             
             // BUT: If the user opens the HTML *served by* GAS, google.script.run works.
             // If local, we better use Mock or warn.
             
             console.warn("Cross-origin fetch to GAS is tricky. Fallback to Mock.");
             // Attempting Mock fallback
          });
          
          // Fallthrough to Mock because of CORS complexity
      }
      
      console.warn(`[MockServer] Calling ${funcName} locally...`);
      setTimeout(() => {
          const mockResponse = MockBackend.handle(getActionName(funcName), data);
          resolve(mockResponse);
      }, 500);

    });
  },
  
  // Defined Methods mapped to appscript.js handlers
  async getSchedules() {
    return this.call('handleGetRequest', { action: 'getSchedules', user_id: getUserId() });
  },
  
  async getCommunitySchedules() {
    return this.call('handleGetRequest', { action: 'getSchedules' }); 
  },

  async createSchedule(schedule) {
    const payload = {
      action: 'createSchedule',
      schedule_id: schedule.id,
      user_id: getUserId(),
      schedule_name: schedule.name,
      description: '',
      is_public: false
    };
    return this.call('handlePostRequest', payload);
  },
  
  async shareSchedule(schedule, newId) {
    const payload = {
      action: 'createSchedule',
      schedule_id: newId,
      user_id: getUserId(),
      schedule_name: schedule.name,
      description: 'Shared via Community',
      is_public: true
    };
    return this.call('handlePostRequest', payload);
  },

  // Optimized Cloning
  async cloneSchedule(sourceId, newId, newName) {
      const payload = {
          action: 'cloneSchedule',
          source_schedule_id: sourceId,
          new_schedule_id: newId,
          new_user_id: getUserId(),
          new_schedule_name: newName
      };
      return this.call('handlePostRequest', payload);
  },

  async addSession(session) {
    const payload = {
      action: 'addSession',
      session_id: session.id,
      schedule_id: currentSchedule.id,
      day_of_week: session.day,
      subject: session.subject,
      start_time: session.start,
      end_time: session.end
    };
    return this.call('handlePostRequest', payload);
  },

  async deleteSession(sessionId) {
    return this.call('handlePostRequest', { 
        action: 'deleteSession', 
        session_id: sessionId 
    });
  },

  async getDiscussions() {
    return this.call('handleGetRequest', { action: 'getDiscussions' });
  },

  async createPost(post) {
      const payload = {
          action: 'createPost',
          post_id: post.id,
          user_id: 'Anonymous', // Or getUserId()
          category: post.category,
          title: post.title,
          content: post.content
      };
      return this.call('handlePostRequest', payload);
  },

  async getComments(postId) {
      return this.call('handleGetRequest', { action: 'getComments', post_id: postId });
  },

  async addComment(comment) {
      const payload = {
          action: 'addComment',
          comment_id: comment.id,
          post_id: comment.postId,
          user_id: 'Anonymous',
          content: comment.content
      };
      return this.call('handlePostRequest', payload);
  }
};

// Helper to map function name to action for Mock/Remote
function getActionName(funcName) {
    if (funcName === 'handlePostRequest') return 'POST_GENERIC'; // Depends on payload.action
    if (funcName === 'handleGetRequest') return 'GET_GENERIC';
    return funcName; // fallback
}

// --- MOCK BACKEND (For Local Testing) ---
const MockBackend = {
    db: {
        schedules: [],
        sessions: [],
        posts: [],
        comments: []
    },
    
    handle(funcName, data) {
        // Intercept based on data.action since we route everything through generic handlers
        const action = data.action; 
        
        if (action === 'getSchedules') return { status: 'success', data: this.db.schedules };
        if (action === 'getSessions') return { status: 'success', data: this.db.sessions.filter(s => s.schedule_id === data.schedule_id) };
        if (action === 'getDiscussions') return { status: 'success', data: this.db.posts };
        if (action === 'getComments') return { status: 'success', data: this.db.comments.filter(c => c.post_id === data.post_id) };

        if (action === 'createSchedule') {
            this.db.schedules.push({ schedule_id: data.schedule_id, user_id: data.user_id, schedule_name: data.schedule_name, is_public: data.is_public });
            return { status: 'success' };
        }
        if (action === 'cloneSchedule') {
             this.db.schedules.push({ schedule_id: data.new_schedule_id, user_id: data.new_user_id, schedule_name: data.new_schedule_name, is_public: false });
             const sources = this.db.sessions.filter(s => s.schedule_id == data.source_schedule_id);
             sources.forEach(s => {
                 this.db.sessions.push({ ...s, schedule_id: data.new_schedule_id, session_id: s.session_id + "_cloned" });
             });
             return { status: 'success' };
        }
        if (action === 'addSession') {
            this.db.sessions.push({ session_id: data.session_id, schedule_id: data.schedule_id, day_of_week: data.day_of_week, subject: data.subject, start_time: data.start_time, end_time: data.end_time });
            return { status: 'success' };
        }
        if (action === 'createPost') {
            this.db.posts.push({ id: data.post_id, title: data.title, content: data.content, category: data.category, timestamp: new Date().toISOString() });
            return { status: 'success' };
        }
        if (action === 'addComment') {
            this.db.comments.push({ comment_id: data.comment_id, post_id: data.post_id, content: data.content, user_id: data.user_id, created_at: new Date() });
            return { status: 'success' };
        }
        if (action === 'deleteSession') {
            this.db.sessions = this.db.sessions.filter(s => s.session_id !== data.session_id);
            return { status: 'success' };
        }

        return { status: 'success', data: [] };
    }
};

// --- DATA MANAGER (Refactored for Async) ---
// Note: We are gradually replacing synchronous getSchedules() with async calls.
// The DataManager now acts as a cache or state holder.
const DataManager = {
  // Local State Cache
  schedules: [],
  community: [],
  posts: [],
  currentPost: null, // For discussion detail

  async init() {
     // No local storage init needed for data, but maybe loads initial data?
     // We will load data in initPlanner() instead.
  },

  getSchedules() {
    return this.schedules;
  },
  
  getCurrentScheduleId() {
      return localStorage.getItem("p2r_currentScheduleId");
  },

  setCurrentScheduleId(id) {
    localStorage.setItem("p2r_currentScheduleId", id);
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
  const navBtn = document.getElementById("nav-" + pageId);
  if (navBtn) navBtn.classList.add("active");

  // Trigger Inits
  if (pageId === "planner") initPlanner();
  if (pageId === "community") loadCommunity();
  if (pageId === "discussion") {
      loadDiscussions();
      closePostDetail(); // Ensure we start at feed
  }
}

// --- PLANNER LOGIC ---
async function initPlanner() {
  try {
    // Show Loading in Dropdown
    const selector = document.getElementById("scheduleSelector");
    if (selector) selector.innerHTML = '<option>Loading...</option>';

    // 1. Fetch Schedules from Server
    const response = await Server.getSchedules();
    // Support both direct array or {status, data} format from backend
    const rawData = response.data || response; 
    
    // Filter only MY schedules (where user_id matches)
    const myId = getUserId();
    DataManager.schedules = rawData.filter(s => s.user_id === myId);

    // If no schedules, create default? 
    // For now, if empty, we might let the user create one or handle UI.
    
    const currentId = DataManager.getCurrentScheduleId();

    // Populate Dropdown
    if (selector) {
      selector.innerHTML = "";
      if (DataManager.schedules.length === 0) {
        selector.innerHTML = '<option value="">-- No Schedules --</option>';
      } else {
        DataManager.schedules.forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s.schedule_id; // Note: Backend uses schedule_id
          opt.text = s.schedule_name;
          opt.selected = s.schedule_id == currentId;
          selector.appendChild(opt);
        });
      }
    }
    
    // If currentId is valid, load it. If not, load the first one.
    if (currentId && DataManager.schedules.find(s => s.schedule_id == currentId)) {
      loadSchedule(currentId);
    } else if (DataManager.schedules.length > 0) {
      loadSchedule(DataManager.schedules[0].schedule_id);
    } else {
        // Clear Grid
        document.getElementById("weeklyView").innerHTML = "<p style='text-align:center; padding:2rem;'>สร้างตารางแรกของคุณเพื่อเริ่มต้น</p>";
    }

  } catch (err) {
    console.error(err);
    alert("Error loading schedules: " + err);
  }
}

async function loadSchedule(id) {
  DataManager.setCurrentScheduleId(id);
  
  // Find schedule metadata in local cache
  const scheduleMeta = DataManager.schedules.find((s) => s.schedule_id == id);
  if (!scheduleMeta) return;

  currentSchedule = {
      id: scheduleMeta.schedule_id,
      name: scheduleMeta.schedule_name,
      sessions: [] // Need to fetch sessions
  };

  // Fetch Sessions for this schedule
  const response = await Server.call('handleGetRequest', { action: 'getSessions', schedule_id: id });
  const sessions = response.data || [];
  
  // Transform sessions to frontend format if needed
  // Backend: session_id, day_of_week, start_time, end_time, subject
  currentSchedule.sessions = sessions.map(s => ({
      id: s.session_id,
      day: s.day_of_week,
      start: s.start_time,
      end: s.end_time,
      subject: s.subject
  }));

  renderWeeklyGrid();
  showWeeklyView(); // Reset view
}

async function createNewSchedule() {
  const name = prompt("ตั้งชื่อตารางใหม่ของคุณ:");
  if (name) {
    const newId = Date.now().toString();
    const newSch = {
      id: newId,
      name: name,
      sessions: [],
    };
    
    try {
        await Server.createSchedule(newSch);
        await initPlanner(); // Reload to see new schedule
    } catch (e) {
        alert("Error creating schedule: " + e);
    }
  }
}

async function deleteCurrentSchedule() {
  if (!currentSchedule) return;
  alert("ฟีเจอร์ลบตารางยังไม่รองรับใน Backend Version นี้ (กำลังพัฒนา)");
  // To implement: Add deleteSchedule to Server API and Backend
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
  
  // Re-fetch or just re-render? Re-render is faster.
  // Ideally, we should sync if changes weren't saved properly, but fine for now.
  renderWeeklyGrid(); 
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
async function deleteEvent(id) {
  if (confirm("ยืนยันการลบกิจกรรมนี้?")) {
      try {
           await Server.deleteSession(id);
           
           // Remove from local state
           currentSchedule.sessions = currentSchedule.sessions.filter(s => s.id !== id);
           renderDailyTimeline();
      } catch (e) {
          alert("Error: " + e);
      }
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

async function saveEvent() {
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
  const newSession = {
    id: Date.now().toString(),
    day: selectedDay,
    subject,
    start,
    end,
  };

  try {
      await Server.addSession(newSession);
      
      currentSchedule.sessions.push(newSession);
      closeAddModal();
      renderDailyTimeline();
      
  } catch(e) {
      alert("Error adding session: " + e);
  }
}

// --- COMMUNITY LOGIC ---
async function shareCurrentSchedule() {
  if (!currentSchedule) return;

  const newId = "shared_" + Date.now();
  try {
      if (confirm('คุณต้องการแชร์ตาราง "' + currentSchedule.name + '" ให้ชุมชนเห็นใช่หรือไม่?')) {
          await Server.shareSchedule(currentSchedule, newId);
          // Also need to share sessions? 
          // Currently Server.shareSchedule only creates the HEADER row in 'schedules' sheet. 
          // We need call optimized Clone from Backend to copy my own schedule strictly for sharing?
          // Actually, shareSchedule creates a public ENTRY. But cloning sessions is cleaner.
          // BUT wait, if we create a new entry "Shared ...", this is basically a clone of current.
          
          await Server.cloneSchedule(currentSchedule.id, newId, currentSchedule.name);
          
          alert("แชร์ตารางเรียบร้อยแล้ว!");
          loadCommunity();
      }
  } catch (e) {
      alert("Share Error: " + e);
  }
}

async function loadCommunity() {
  const list = document.getElementById("communityList");
  if (!list) return;
  list.innerHTML = "<p>Loading community schedules...</p>";

  try {
      const response = await Server.getCommunitySchedules();
      const commData = response.data || [];
      list.innerHTML = "";

      if (commData.length === 0) {
        list.innerHTML = "<p style='text-align:center; color:var(--text-secondary); margin:2rem 0;'>ยังไม่มีตารางที่แชร์มา</p>";
        return;
      }
      
      // Filter: Show ALL public schedules (including my own shared ones) 
      // so I can verify my share worked.
      const others = commData.filter(s => s.is_public == true);

      others.forEach((sch) => {
        const el = document.createElement("div");
        el.className = "card glass";
        el.style.display = "flex";
        el.style.justifyContent = "space-between";
        el.style.alignItems = "center";
        el.style.padding = "1.5rem";
        el.innerHTML = `
                <div>
                    <h3 style="margin:0;">${sch.schedule_name}</h3>
                    <p style="margin:0; color:var(--text-secondary);">By User ${sch.user_id.substr(0,4)}...</p>
                </div>
                <button class="btn" onclick="copySchedule('${sch.schedule_id}', '${sch.schedule_name}')">นำไปใช้</button>
            `;
        list.appendChild(el);
      });
  } catch (e) {
      list.innerHTML = "Error loading community: " + e;
  }
}

async function copySchedule(sharedId, sharedName) {
  try {
      const myNewName = prompt("ตั้งชื่อสำหรับตารางที่คุณคัดลอก:", "Copy of " + sharedName);
      if (!myNewName) return;

      const myNewId = Date.now().toString();

      // OPTIMIZED: Call Single Backend Function
      await Server.cloneSchedule(sharedId, myNewId, myNewName);

      alert("คัดลอกเรียบร้อย!");
      initPlanner();

  } catch(e) {
      alert("Copy Error: " + e);
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
async function createPost() {
  const title = document.getElementById("postTitle").value;
  const category = document.getElementById("postCategory").value;
  const content = document.getElementById("postContent").value;

  if (!title || !content) {
    alert("กรุณากรอกข้อมูลให้ครบ");
    return;
  }
  
  const post = {
      id: Date.now().toString(),
      title,
      category,
      content
  };

  try {
      await Server.createPost(post);
      
      // Clear inputs
      document.getElementById("postTitle").value = "";
      document.getElementById("postContent").value = "";

      loadDiscussions();
  } catch(e) {
      alert("Post Error: " + e);
  }
}

async function loadDiscussions() {
  const feed = document.getElementById("discussionFeed");
  if (!feed) return;
  feed.innerHTML = "<p>Loading discussions...</p>";
  
  try {
      const response = await Server.getDiscussions();
      const posts = response.data || [];
      DataManager.posts = posts; // Cache posts
      
      feed.innerHTML = "";

      if (posts.length === 0) {
        feed.innerHTML = "<p style='text-align:center; color:var(--text-secondary); margin:2rem 0;'>ยังไม่มีโพสต์พูดคุย</p>";
        return;
      }
      
      posts.reverse().forEach((p) => {
        const date = p.created_at ? new Date(p.created_at).toLocaleString("th-TH") : "";
        
        const div = document.createElement("div");
        div.className = "card glass post-item";
        div.style.cursor = "pointer";
        div.onclick = () => viewPost(p.post_id); // Click to view details
        
        div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items: center; margin-bottom: 1rem;">
                    <span class="tag">${p.category}</span>
                    <span class="post-meta">${date}</span>
                </div>
                <h3 style="margin-bottom: 0.5rem; color: var(--primary-color);">${p.title}</h3>
                <p style="color: var(--text-secondary); margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.content}</p>
                <div style="margin-top:0.5rem; font-size:0.8rem; color:var(--text-secondary);">คลิกเพื่ออ่านต่อ & คอมเมนต์...</div>
            `;
        feed.appendChild(div);
      });
  } catch (e) {
      feed.innerHTML = "Error loading posts: " + e;
  }
}

async function viewPost(postId) {
    const post = DataManager.posts.find(p => p.post_id == postId);
    if (!post) return;
    
    DataManager.currentPost = post;

    // UI Toggle
    document.getElementById("discussionFeed").style.display = "none";
    document.getElementById("postDetailView").style.display = "block";
    
    // Render Content
    document.getElementById("detailTitle").innerText = post.title;
    document.getElementById("detailCategory").innerText = post.category;
    document.getElementById("detailUser").innerText = "โดย " + (post.user_id || "Anonymous");
    document.getElementById("detailContent").innerText = post.content;
    
    // Load Comments
    loadComments(postId);
}

function closePostDetail() {
    document.getElementById("postDetailView").style.display = "none";
    document.getElementById("discussionFeed").style.display = "block";
    DataManager.currentPost = null;
}

async function loadComments(postId) {
    const list = document.getElementById("commentsList");
    const countSpan = document.getElementById("commentCount");
    list.innerHTML = "<p>Loading comments...</p>";
    
    try {
        const response = await Server.getComments(postId);
        const comments = response.data || [];
        
        countSpan.innerText = `(${comments.length})`;
        list.innerHTML = "";
        
        if (comments.length === 0) {
            list.innerHTML = "<p style='color:var(--text-secondary); font-style:italic;'>ยังไม่มีความคิดเห็น เป็นคนแรกเลย!</p>";
            return;
        }

        comments.forEach(c => {
            const div = document.createElement("div");
            div.className = "card glass";
            div.style.padding = "1rem";
            div.style.marginBottom = "0.8rem";
            div.innerHTML = `
                <div style="font-weight:600; font-size:0.9rem; margin-bottom:0.3rem;">${c.user_id || "Anonymous"}</div>
                <div style="color:var(--text-primary);">${c.content}</div>
            `;
            list.appendChild(div);
        });

    } catch (e) {
        list.innerHTML = "Error loading comments.";
    }
}

async function submitComment() {
    if (!DataManager.currentPost) return;
    
    const input = document.getElementById("commentInput");
    const content = input.value;
    
    if (!content) return;
    
    const newComment = {
        id: Date.now().toString(),
        postId: DataManager.currentPost.post_id,
        content: content
    };
    
    try {
        await Server.addComment(newComment);
        input.value = ""; // Clear
        loadComments(newComment.postId); // Reload
    } catch (e) {
        alert("Comment Error: " + e);
    }
}
