// ==============================================================================
// THAALAM — BUSINESS REGISTRATION SCRIPT
// ------------------------------------------------------------------------------
// HOW TO DEPLOY:
//   1. Open your Business Registration Google Sheet
//   2. Extensions → Apps Script
//   3. Delete all existing code, paste this entire script
//   4. Save (Ctrl + S)
//   5. Deploy → New Deployment → Web App
//      Execute as: Me  |  Who has access: Anyone
//   6. Copy the Web App URL → paste into Launch_Your_Company.html as APPS_SCRIPT_URL
// ==============================================================================

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
var SPREADSHEET_ID = "1z97T9tl8vSSgPa_eYBy-LKLo2n01MF0-21KIDkwDOFM"; // ← your Sheet ID
var SHEET_NAME     = "Business registration";                           // ← your tab name
var NOTIFICATION_EMAIL = "thaalamtsc@gmail.com";                        // ← admin alert email
// ─────────────────────────────────────────────────────────────────────────────


// ── GET: returns all rows as JSON (used by admin panel sync) ──────────────────
function doGet(e) {
  try {
    var sheet  = getBusinessSheet();
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
    var sheet = getBusinessSheet();
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
        if      (nHeader === "companyname")                   val = normMap["companyname"]      || normMap["company"]         || "";
        else if (nHeader === "businesscategory")              val = normMap["businesscategory"] || normMap["category"]        || "";
        else if (nHeader === "businesstype")                  val = normMap["businesstype"]     || normMap["type"]            || "";
        else if (nHeader === "industrysectorsubcategories")   val = normMap["industry"]         || normMap["industrysector"]  || normMap["sector"] || "";
        else if (nHeader === "yearestablished")               val = normMap["yearestablished"]  || normMap["year"]            || "";
        else if (nHeader === "companysize")                   val = normMap["companysize"]      || normMap["size"]            || "";
        else if (nHeader === "gstnumber")                     val = normMap["gstnumber"]        || normMap["gst"]             || normMap["gstin"] || "";
        else if (nHeader === "cin")                           val = normMap["cin"]              || "";
        else if (nHeader === "contactperson")                 val = normMap["contactperson"]    || normMap["founder"]         || normMap["contactname"] || "";
        else if (nHeader === "designation")                   val = normMap["designation"]      || normMap["role"]            || "";
        else if (nHeader === "emailaddress")                  val = normMap["email"]            || normMap["emailaddress"]    || normMap["gmail"] || "";
        else if (nHeader === "mobilenumber")                  val = normMap["mobilenumber"]     || normMap["phone"]           || normMap["mobile"] || "";
        else if (nHeader === "whatsappnumber")                val = normMap["whatsappnumber"]   || normMap["whatsapp"]        || "";
        else if (nHeader === "country")                       val = normMap["country"]          || "";
        else if (nHeader === "state")                         val = normMap["state"]            || "";
        else if (nHeader === "city")                          val = normMap["city"]             || "";
        else if (nHeader === "pincode")                       val = normMap["pincode"]          || normMap["zip"]             || normMap["postalcode"] || "";
        else if (nHeader === "address")                       val = normMap["address"]          || "";
        else if (nHeader === "googlemapslink")                val = normMap["googlemapslink"]   || normMap["mapslink"]        || normMap["googlemaps"] || "";
        else if (nHeader === "website")                       val = normMap["website"]          || normMap["websiteurl"]      || "";
        else if (nHeader === "linkedin")                      val = normMap["linkedin"]         || normMap["linkedinurl"]     || "";
        else if (nHeader === "instagram")                     val = normMap["instagram"]        || normMap["instagramurl"]    || "";
        else if (nHeader === "productsservices")              val = normMap["productsservices"] || normMap["services"]        || normMap["description"] || "";
        else if (nHeader === "serviceareas")                  val = normMap["serviceareas"]     || normMap["servicearea"]     || normMap["city"] || "";
        else if (nHeader === "companylogourl")                val = normMap["companylogo"]      || normMap["logourl"]         || normMap["logo"] || "";
        else if (nHeader === "companybrochureurl")            val = normMap["companybrochure"]  || normMap["brochureurl"]     || normMap["brochure"] || "";
      }

      row.push((val !== undefined && val !== null) ? String(val) : "");
    }

    sheet.appendRow(row);

    // Send email alert to admin
    try {
      if (NOTIFICATION_EMAIL) {
        var compName = normMap["companyname"] || data["Company Name"] || "New Company";
        var contact  = normMap["contactperson"] || data["Contact Person"] || "-";
        var email    = normMap["emailaddress"] || normMap["email"] || data["Email Address"] || "-";
        var phone    = normMap["mobilenumber"] || normMap["phone"] || data["Mobile Number"] || "-";
        var category = normMap["businesscategory"] || data["Business Category"] || "-";
        var city     = normMap["city"] || data["City"] || "-";

        var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        var emailSubject = "New Business Registration: " + compName;
        var emailBody = "New Business Registration Received on Thaalam Platform:\n\n" +
          "• Company Name: " + compName + "\n" +
          "• Contact Person: " + contact + "\n" +
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

    return jsonResponse({ status: "success", message: "Business registered successfully" });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}


// ── Sheet initialiser — column headers match exact form labels ────────────────
function getBusinessSheet() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Create header row only if the sheet is completely empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Timestamp",                            // auto-generated
      "Company Name",                         // form id: companyName
      "Business Category",                    // form id: businessCategory (select)
      "Business Type",                        // form id: businessType (select)
      "Industry & Sector - Sub Categories",   // form id: industry (select)
      "Year Established",                     // form id: yearEstablished
      "Company Size",                         // form id: companySize (select)
      "GST Number",                           // form id: gstNumber
      "CIN",                                  // form id: cin
      "Contact Person",                       // form id: contactPerson
      "Designation",                          // form id: designation
      "Email Address",                        // form id: email
      "Mobile Number",                        // form id: mobileNumber
      "WhatsApp Number",                      // form id: whatsappNumber
      "Country",                              // form id: country
      "State",                                // form id: state
      "City",                                 // form id: city
      "Pincode",                              // form id: pincode
      "Address",                              // form id: address
      "Google Maps Link",                     // form id: googleMapsLink
      "Website",                              // form id: website
      "LinkedIn",                             // form id: linkedin
      "Instagram",                            // form id: instagram
      "Products & Services",                  // form id: productsServices
      "Service Areas",                        // form id: serviceAreas
      "Company Logo URL",                     // form id: companyLogo (URL input)
      "Company Brochure URL"                  // form id: companyBrochure (URL input)
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
