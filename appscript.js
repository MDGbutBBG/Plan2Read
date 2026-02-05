/* Plan2Read Backend API
   เชื่อมต่อกับ Google Spreadsheet ID: 1gCtou7_nZxufm5-EuTtBirgEctHN-pkcmHk42z84WVI
*/

const SPREADSHEET_ID = '1gCtou7_nZxufm5-EuTtBirgEctHN-pkcmHk42z84WVI';

// ชื่อ Sheet ตามที่ออกแบบไว้ใน Database Design
const SHEETS = {
  USERS: 'users',
  SCHEDULES: 'schedules',
  SESSIONS: 'study_sessions',
  DISCUSSIONS: 'discussions',
  COMMENTS: 'comments'
};

/* =========================================
   CORE FUNCTIONS: doGet & doPost
   ========================================= */

// รับข้อมูล (GET) เช่น ดึงตาราง, ดึงกระทู้
function doGet(e) {
  // 1. ถ้ามี Parameter "action" ให้ทำงานเป็น API
  if (e && e.parameter && e.parameter.action) {
    const action = e.parameter.action;
    const result = handleGetRequest(action, e.parameter);
    return createJSONOutput(result);
  }

  // 2. ถ้าไม่มี "action" ให้ Return หน้าเว็บ (HTML)
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Plan2Read - วางแผนการเรียน')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// บันทึกข้อมูล (POST) เช่น สร้างตารางใหม่, โพสต์กระทู้
function doPost(e) {
  try {
    if (!e || !e.postData) {
        return createJSONOutput({ status: 'error', message: 'No post data found.' });
    }
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const result = handlePostRequest(action, data);
    return createJSONOutput(result);
  } catch (error) {
    return createJSONOutput({ status: 'error', message: error.toString() });
  }
}

/* =========================================
   HANDLERS
   ========================================= */

function handleGetRequest(action, params) {
  const db = SpreadsheetApp.openById(SPREADSHEET_ID);

  switch (action) {
    case 'getSchedules':
      // ดึงตารางทั้งหมดของ User หรือตารางที่เป็น Public
      return getSchedules(db, params.user_id);
      
    case 'getSessions':
      // ดึงรายละเอียดกิจกรรมในตาราง (Sessions)
      return getSessions(db, params.schedule_id);

    case 'getDiscussions':
      // ดึงกระทู้พูดคุย
      return getDataFromSheet(db, SHEETS.DISCUSSIONS);
      
    case 'getComments':
      // ดึงคอมเมนต์ของโพสต์
      return getComments(db, params.post_id);

    default:
      return { status: 'error', message: 'Unknown action: ' + action };
  }
}

function handlePostRequest(action, data) {
  const db = SpreadsheetApp.openById(SPREADSHEET_ID);

  switch (action) {
    case 'createSchedule':
      return createSchedule(db, data);
      
    case 'cloneSchedule':
      return cloneSchedule(db, data);
      
    case 'addSession':
      return addSession(db, data);
      
    case 'createPost':
      return createPost(db, data);
      
    case 'addComment':
      return addComment(db, data);
      
    case 'deleteSession':
       return deleteRowByColumn(db, SHEETS.SESSIONS, 'session_id', data.session_id);

    default:
      return { status: 'error', message: 'Unknown action: ' + action };
  }
}

/* =========================================
   LOGIC FUNCTIONS
   ========================================= */

// 1. ดึงข้อมูล Schedules + Join กับ Users (ถ้าจำเป็น)
function getSchedules(db, userId) {
  const sheet = db.getSheetByName(SHEETS.SCHEDULES);
  if (!sheet) return { status: 'error', message: 'Sheet "schedules" not found' };
  
  const data = sheet.getDataRange().getValues();
  const headers = data.shift(); // เอาหัวตารางออก
  
  const schedules = data.map(row => {
    return {
      schedule_id: row[0],
      user_id: row[1],
      schedule_name: row[2],
      description: row[3],
      is_public: row[4],
      updated_at: row[5]
    };
  });

  // Filter: ถ้าส่ง userId มา ให้เอาเฉพาะของคนนั้น + public, ถ้าไม่ส่ง ให้เอา public ทั้งหมด
  const filtered = schedules.filter(s => {
    if (userId) {
      return s.user_id == userId || s.is_public == true;
    }
    return s.is_public == true;
  });

  return { status: 'success', data: filtered };
}

// 2. ดึง Sessions ของ Schedule ID นั้นๆ
function getSessions(db, scheduleId) {
  const allSessions = getDataFromSheet(db, SHEETS.SESSIONS);
  if (allSessions.status === 'error') return allSessions;

  // Filter เฉพาะของ schedule_id ที่ต้องการ
  const filtered = allSessions.data.filter(s => s.schedule_id == scheduleId);
  return { status: 'success', data: filtered };
}

// 3. สร้าง Schedule ใหม่
function createSchedule(db, data) {
  const sheet = db.getSheetByName(SHEETS.SCHEDULES);
  const newRow = [
    data.schedule_id, // ID สร้างจากฝั่ง Client (Date.now()) หรือจะทำ Auto-increment ก็ได้
    data.user_id,
    data.schedule_name,
    data.description || '',
    data.is_public || false,
    new Date() // updated_at
  ];
  sheet.appendRow(newRow);
  return { status: 'success', message: 'Schedule created', schedule_id: data.schedule_id };
}

// 4. เพิ่ม Session (วิชาเรียน)
function addSession(db, data) {
  const sheet = db.getSheetByName(SHEETS.SESSIONS);
  const newRow = [
    data.session_id,
    data.schedule_id,
    data.day_of_week,
    data.subject,
    data.start_time,
    data.end_time
  ];
  sheet.appendRow(newRow);
  return { status: 'success', message: 'Session added' };
}

// 5. สร้าง Post
function createPost(db, data) {
  const sheet = db.getSheetByName(SHEETS.DISCUSSIONS);
  const newRow = [
    data.post_id,
    data.user_id || 'guest',
    data.category,
    data.title,
    data.content,
    new Date()
  ];
  sheet.appendRow(newRow);
  return { status: 'success', message: 'Post created' };
}

// 6. ดึง Comments ของ Post ID
function getComments(db, postId) {
  const allComments = getDataFromSheet(db, SHEETS.COMMENTS);
  if (allComments.status === 'error') return allComments;

  const filtered = allComments.data.filter(c => c.post_id == postId);
  return { status: 'success', data: filtered };
}

// 7. เพิ่ม Comment
function addComment(db, data) {
  const sheet = db.getSheetByName(SHEETS.COMMENTS);
  if (!sheet) return { status: 'error', message: 'Sheet "comments" not found' };

  const newRow = [
    data.comment_id,
    data.post_id,
    data.user_id || 'guest',
    data.content,
    new Date()
  ];
  sheet.appendRow(newRow);
  return { status: 'success', message: 'Comment added' };
}

// 8. Clone Schedule (Optimized)
function cloneSchedule(db, data) {
  const sourceId = data.source_schedule_id;
  const newId = data.new_schedule_id;
  const newUserId = data.new_user_id;
  const newName = data.new_schedule_name;

  // 1. Create New Schedule Header
  const schSheet = db.getSheetByName(SHEETS.SCHEDULES);
  schSheet.appendRow([
    newId,
    newUserId,
    newName,
    'Cloned from ' + sourceId,
    false,
    new Date()
  ]);

  // 2. Clone Sessions
  const sessSheet = db.getSheetByName(SHEETS.SESSIONS);
  const sessData = sessSheet.getDataRange().getValues();
  // Find index of 'schedule_id' column (Assume col 2 -> index 1)
  // But safest to use helper or hardcode based on schema. 
  // Schema: session_id(0), schedule_id(1), day(2), subject(3), start(4), end(5)
  
  const sessionsToClone = [];
  // Skip header (row 0)
  for (let i = 1; i < sessData.length; i++) {
    if (sessData[i][1] == sourceId) {
      const original = sessData[i];
      // Create new session row
      sessionsToClone.push([
        'sess_' + newId + '_' + i, // Generate new unique ID
        newId, // New Schedule ID
        original[2], // Day
        original[3], // Subject
        original[4], // Start
        original[5]  // End
      ]);
    }
  }

  // Batch insert if there are sessions
  if (sessionsToClone.length > 0) {
      // getRange(row, col, numRows, numCols)
      const startRow = sessSheet.getLastRow() + 1;
      sessSheet.getRange(startRow, 1, sessionsToClone.length, 6).setValues(sessionsToClone);
  }

  return { status: 'success', message: 'Schedule cloned successfully' };
}


/* =========================================
   HELPER FUNCTIONS
   ========================================= */

// ฟังก์ชันแปลงข้อมูลใน Sheet เป็น Array of Objects
function getDataFromSheet(db, sheetName) {
  const sheet = db.getSheetByName(sheetName);
  if (!sheet) return { status: 'error', message: 'Sheet "' + sheetName + '" not found' };
  
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return { status: 'success', data: [] };

  const headers = data.shift(); // แถวแรกคือ Header
  
  const result = data.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });

  return { status: 'success', data: result };
}

// ฟังก์ชันช่วยลบแถว (อย่างง่าย)
function deleteRowByColumn(db, sheetName, colName, value) {
    const sheet = db.getSheetByName(sheetName);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const colIndex = headers.indexOf(colName);
    
    if (colIndex === -1) return {status: 'error', message: 'Column not found'};

    // วนลูปจากล่างขึ้นบนเพื่อป้องกัน index เปลี่ยนเมื่อลบ
    for (let i = data.length - 1; i >= 1; i--) {
        if (data[i][colIndex] == value) {
            sheet.deleteRow(i + 1); // +1 เพราะ row เริ่มที่ 1 แต่ array เริ่มที่ 0
            return {status: 'success', message: 'Deleted'};
        }
    }
    return {status: 'error', message: 'Not found'};
}

// ฟังก์ชันส่งค่ากลับเป็น JSON
function createJSONOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================================
   TEMPLATE HELPER
   ========================================= */

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename)
      .getContent();
}