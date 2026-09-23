// ==============================================================================
// THAALAM — PROFESSIONAL REGISTRATION SCRIPT
// ------------------------------------------------------------------------------
// HOW TO DEPLOY:
//   1. Open your Professional Registration Google Sheet
//   2. Extensions → Apps Script
//   3. Delete all existing code, paste this entire script
//   4. Save (Ctrl + S)
//   5. Deploy → New Deployment → Web App
//      Execute as: Me  |  Who has access: Anyone
//   6. Copy the Web App URL → paste into Register.html as scriptURL
// ==============================================================================

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
var SPREADSHEET_ID = "YOUR_PROFESSIONAL_SHEET_ID_HERE"; // ← your Sheet ID from the URL
var SHEET_NAME     = "Professional registration";        // ← your tab name
var NOTIFICATION_EMAIL = "thaalamtsc@gmail.com";         // ← admin alert email
// ─────────────────────────────────────────────────────────────────────────────


// ── GET: returns all rows as JSON (used by admin panel sync) ──────────────────
function doGet(e) {
  try {
    var sheet  = getProfessionalSheet();
    var values = sheet.getDataRange().getValues();

    if (values.length < 2) {
      return jsonResponse({ status: "success", total: 0, rows: [] });
    }

    var headers = values[0];
    var rows    = [];

    for (var i = 1; i < values.length; i++) {
      var row      = values[i];
      var record   = {};
      var hasValue = false;

      for (var j = 0; j < headers.length; j++) {
        var val = row[j];
        if (val instanceof Date) val = val.toISOString();
        if (val !== "" && val !== null && val !== undefined) hasValue = true;
        record[headers[j]] = val;
      }

      if (hasValue) {
        record._rowNumber = i + 1;
        rows.push(record);
      }
    }

    return jsonResponse({ status: "success", total: rows.length, rows: rows });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}


// ── POST: appends one registration row ────────────────────────────────────────
function doPost(e) {
  try {
    var sheet = getProfessionalSheet();
    var data  = {};

    // Accept URL-encoded form parameters
    if (e && e.parameter) {
      var keys = Object.keys(e.parameter);
      for (var k = 0; k < keys.length; k++) {
        data[keys[k]] = e.parameter[keys[k]];
      }
    }

    // Accept JSON body (merges on top)
    if (e && e.postData && e.postData.contents) {
      try {
        var parsed = JSON.parse(e.postData.contents);
        var pKeys  = Object.keys(parsed);
        for (var p = 0; p < pKeys.length; p++) {
          data[pKeys[p]] = parsed[pKeys[p]];
        }
      } catch (_) { /* not JSON */ }
    }

    var headers = sheet.getDataRange().getValues()[0] || [];

    // Build normalised lookup map from all incoming keys
    var normMap  = {};
    var dataKeys = Object.keys(data);
    for (var d = 0; d < dataKeys.length; d++) {
      normMap[normalizeKey(dataKeys[d])] = data[dataKeys[d]];
    }

    // Build row aligned to sheet column order
    var row = [];
    for (var h = 0; h < headers.length; h++) {
      var header  = String(headers[h] || "").trim();
      var nHeader = normalizeKey(header);

      // Auto-fill timestamp
      if (nHeader === "timestamp" || nHeader === "submissiontime" || nHeader === "createdat") {
        row.push(new Date());
        continue;
      }

      // Exact key first, then normalised
      var val;
      if (data[header] !== undefined && data[header] !== null && data[header] !== "") {
        val = data[header];
      } else {
        val = normMap[nHeader];
      }

      // Fallbacks — map sheet column label → sent field key
      if (!val || val === "") {
        // "Domain of Expertise" ← sent as "Domain of Expertise" or "category"
        if      (nHeader === "domainofexpertise")   val = normMap["category"]            || normMap["domainexpertise"]     || normMap["domain"]             || "";
        // "Years of Experience" ← sent as "Years of Experience" or "experience"
        else if (nHeader === "yearsofexperience")   val = normMap["experience"]          || normMap["experienceyears"]     || normMap["yearsexp"]           || "";
        // "Languages Known" ← sent as "Languages Known" or "languages"
        else if (nHeader === "languagesknown")      val = normMap["languages"]           || normMap["languagesspoken"]     || "";
        // "Industry Experience" ← sent as "Industry Experience" or "industry_experience"
        else if (nHeader === "industryexperience")  val = normMap["industryexperience"]  || normMap["industry"]            || "";
        // "Current Organization" ← sent as "Current Organization" or "current_organization"
        else if (nHeader === "currentorganization") val = normMap["currentorganization"] || normMap["organization"]        || normMap["company"]            || "";
        // "Professional Title" ← sent as "Professional Title" or "professional_title"
        else if (nHeader === "professionaltitle")   val = normMap["professionaltitle"]   || normMap["title"]               || "";
        // "Profile Photo URL" ← sent as "Profile Photo URL" or "profile_photo"
        else if (nHeader === "profilephotourl")     val = normMap["profilephoto"]        || normMap["photo"]               || normMap["profilephotouri"]    || "";
        // "Other Social Media" ← sent as "Other Social Media" or "social_media"
        else if (nHeader === "othersocialmedia")    val = normMap["socialmedia"]         || normMap["facebook"]            || normMap["socialmediaurl"]      || "";
        // "Terms Agreed" ← sent as "Terms Agreed" or "terms"
        else if (nHeader === "termsagreed")         val = normMap["terms"]               || "true";
        // "Email Address" ← sent as "Email Address" or "email"
        else if (nHeader === "emailaddress")        val = normMap["email"]               || normMap["gmail"]               || "";
        // "Phone Number" ← sent as "Phone Number" or "phone"
        else if (nHeader === "phonenumber")         val = normMap["phone"]               || normMap["mobilenumber"]        || normMap["mobile"]             || "";
        // "Website / Portfolio" ← sent as "Website / Portfolio" or "website"
        else if (nHeader === "websiteportfolio")    val = normMap["website"]             || normMap["websiteurl"]          || normMap["portfoliourl"]       || "";
        // "LinkedIn Profile" ← sent as "LinkedIn Profile" or "linkedin"
        else if (nHeader === "linkedinprofile")     val = normMap["linkedin"]            || normMap["linkedinurl"]         || "";
        // "Instagram Profile" ← sent as "Instagram Profile" or "instagram"
        else if (nHeader === "instagramprofile")    val = normMap["instagram"]           || normMap["instagramurl"]        || "";
        // "Twitter / X Profile" ← sent as "Twitter / X Profile" or "twitter"
        else if (nHeader === "twitterxprofile")     val = normMap["twitter"]             || normMap["twitterurl"]          || normMap["xprofile"]           || "";
        // "YouTube Channel" ← sent as "YouTube Channel" or "youtube"
        else if (nHeader === "youtubechannel")      val = normMap["youtube"]             || normMap["youtubeurl"]          || "";
        // "GitHub / Portfolio" ← sent as "GitHub / Portfolio" or "portfolio"
        else if (nHeader === "githubportfolio")     val = normMap["portfolio"]           || normMap["github"]              || normMap["portfoliolink"]      || "";
        // "Full Name" ← sent as "Full Name" or "fullname"
        else if (nHeader === "fullname")            val = normMap["fullname"]            || normMap["name"]                || "";
        // "Availability" ← sent as "Availability" or "availability"
        else if (nHeader === "availability")        val = normMap["availability"]        || normMap["worktype"]            || normMap["availabilitystatus"] || "";
      }

      row.push((val !== undefined && val !== null) ? String(val) : "");
    }

    sheet.appendRow(row);

    // Send email alert to admin
    try {
      if (NOTIFICATION_EMAIL) {
        var profName = normMap["fullname"] || data["Full Name"] || "New Professional";
        var title    = normMap["professionaltitle"] || data["Professional Title"] || "-";
        var email    = normMap["emailaddress"] || normMap["email"] || data["Email Address"] || "-";
        var phone    = normMap["mobilenumber"] || normMap["phone"] || data["Mobile Number"] || "-";
        var category = normMap["category"] || data["Category"] || "-";
        var city     = normMap["city"] || data["City"] || "-";

        var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        var emailSubject = "New Professional Registration: " + profName;
        var emailBody = "New Professional Registration Received on Thaalam Platform:\n\n" +
          "• Full Name: " + profName + "\n" +
          "• Professional Title: " + title + "\n" +
          "• Email Address: " + email + "\n" +
          "• Mobile Number: " + phone + "\n" +
          "• Category: " + category + "\n" +
          "• City: " + city + "\n" +
          "• Submission Time: " + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + "\n\n" +
          "View full details in the Google Sheet: " + ss.getUrl();

        MailApp.sendEmail({
          to: NOTIFICATION_EMAIL,
          subject: emailSubject,
          body: emailBody
        });
      }
    } catch (mailErr) {
      Logger.log("Email notification error: " + mailErr.toString());
    }

    return jsonResponse({ status: "success", message: "Professional registered successfully" });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}


// ── Sheet initialiser — column headers match exact form labels ────────────────
function getProfessionalSheet() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Create header row only if the sheet is completely empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Timestamp",              // auto-generated
      "Full Name",              // form id: fullname
      "Professional Title",     // form id: professional_title
      "Domain of Expertise",    // form id: category (select)
      "Specialization",         // form id: specialization
      "Years of Experience",    // form id: experience (values: 1-3 / 3-5 / 5-10 / 10+)
      "Industry Experience",    // form id: industry_experience
      "Current Organization",   // form id: current_organization
      "Designation",            // form id: designation
      "Location",               // form id: location
      "Phone Number",           // form id: phone
      "Email Address",          // form id: email
      "Qualification",          // form id: qualification
      "Languages Known",        // form id: languages
      "Availability",           // form id: availability
      "Skills",                 // form id: skills
      "Website / Portfolio",    // form id: website
      "LinkedIn Profile",       // form id: linkedin
      "Instagram Profile",      // form id: instagram
      "Twitter / X Profile",    // form id: twitter
      "YouTube Channel",        // form id: youtube
      "GitHub / Portfolio",     // form id: portfolio
      "Other Social Media",     // form id: social_media
      "Profile Photo URL",      // form id: profile_photo
      "Terms Agreed"            // form id: terms (checkbox)
    ]);
  }

  return sheet;
}


// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeKey(v) {
  return String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
