/* index.html additions for the six colleges added to backend/Code.gs.
   The page copes with a college missing from these (it falls back to a grey initials badge
   and "Times not published"), so they can go in before or after the backend.

   Crests, CREDITS and the final colours: run tools/new_college_crests.py, which also prints
   the INFO lines below with the colour taken from each crest. The colours here are stand-ins
   until then: red for the red fields of Fitzwilliam, Peterhouse and St Catharine's, blue for
   Pembroke's blue bars, grey for Homerton. */

/* ---- INFO: add inside const INFO = { ... } ----
   The dining hall building itself, from the University map and OpenStreetMap
   (as recorded by grub.cam, supabase/migrations/0012_venue_locations.sql). */
  fitzwilliam:  { lat:52.21545, lng:0.10597, c:"#B03A2E" },
  homerton:     { lat:52.18577, lng:0.13444, c:"#6B7280" },   /* the page's grey until the crest gives a colour */
  pembroke:     { lat:52.20189, lng:0.11885, c:"#2F5DA8" },
  peterhouse:   { lat:52.20080, lng:0.11857, c:"#C0392B" },
  stcatharines: { lat:52.20314, lng:0.11651, c:"#A93226" },
  lucycavendish:{ lat:52.21149, lng:0.10947, c:"#6B7280" },   /* Warburton Hall; grey until the crest gives a colour */

/* ---- PLACES: add inside const PLACES = { ... } ----
   Fitzwilliam and St Catharine's: from their own pages (13 Oct 2026).
   Homerton, Peterhouse, Pembroke and Lucy Cavendish: as grub.cam lists them (8 Oct 2026),
   not yet checked against the colleges' pages. */
 "fitzwilliam": {
  "rules": [
   { "d": "12345", "m": "lunch", "f": "12:00", "t": "13:30" },
   { "d": "06", "m": "lunch", "f": "11:30", "t": "13:30", "l": "Brunch", "n": "Brunch replaces lunch at weekends" },
   { "d": "0123456", "m": "dinner", "f": "18:00", "t": "19:00", "n": "The Buttery, in the Central Building. Dinner every day" }
  ],
  "g": "open",
  "guests": "Members of the public are always welcome. Pay by credit or debit card or contactless (no cash), and a processing charge is added.",
  "src": "https://www.fitz.cam.ac.uk/cafe-bar-and-buttery",
  "guestSrc": "https://www.fitz.cam.ac.uk/cafe-bar-and-buttery"
 },
 "homerton": {
  "rules": [
   { "d": "123456", "m": "lunch", "f": "12:00", "t": "14:00" },
   { "d": "0", "m": "lunch", "f": "11:00", "t": "14:00", "l": "Brunch", "n": "Sunday brunch replaces lunch" },
   { "d": "12345", "m": "dinner", "f": "17:30", "t": "19:00" }
  ],
  "g": "unknown",
  "guests": "unknown",
  "src": "https://www.homerton.cam.ac.uk/catering",
  "guestSrc": "https://www.homerton.cam.ac.uk/catering"
 },
 "pembroke": {
  "rules": [
   { "d": "12345", "m": "lunch", "f": "11:45", "t": "13:30" },
   { "d": "06", "m": "lunch", "f": "10:00", "t": "13:15", "l": "Brunch", "n": "Brunch replaces lunch at weekends" },
   { "d": "0125", "m": "dinner", "f": "17:30", "t": "18:30" },
   { "d": "346", "m": "dinner", "f": "17:45", "t": "18:45" }
  ],
  "g": "unknown",
  "guests": "unknown",
  "src": "https://www.pem.cam.ac.uk/college/catering/information-students/servery-menu",
  "guestSrc": "https://www.pem.cam.ac.uk/college/catering/information-students/servery-menu"
 },
 "peterhouse": {
  "rules": [
   { "d": "12345", "m": "lunch", "f": "11:45", "t": "13:30" },
   { "d": "6", "m": "lunch", "f": "10:30", "t": "13:30", "l": "Brunch", "n": "Saturday brunch replaces lunch. No lunch on Sundays" },
   { "d": "0123456", "m": "dinner", "f": "17:45", "t": "18:45" }
  ],
  "g": "unknown",
  "guests": "unknown",
  "src": "https://petmenu.co.uk/",
  "guestSrc": "https://petmenu.co.uk/"
 },
 "stcatharines": {
  "rules": [
   { "d": "12345", "m": "lunch", "f": "12:00", "t": "13:30" },
   { "d": "06", "m": "lunch", "f": "10:30", "t": "13:30", "l": "Brunch", "n": "Brunch replaces lunch at weekends" },
   { "d": "1256", "m": "dinner", "f": "18:00", "t": "19:00" },
   { "d": "034", "m": "dinner", "f": "18:00", "t": "18:45" }
  ],
  "g": "unknown",
  "guests": "unknown",
  "src": "https://www.caths.cam.ac.uk/students/college-facilities-and-forms/catering-for-our-community/cafeteria",
  "srcNote": "term time",
  "guestSrc": "https://www.caths.cam.ac.uk/students/college-facilities-and-forms/catering-for-our-community/cafeteria"
 },
 "lucycavendish": {
  "rules": [
   { "d": "12345", "m": "lunch", "f": "12:30", "t": "13:45" },
   { "d": "6", "m": "lunch", "f": "11:00", "t": "13:00", "l": "Brunch" },
   { "d": "0", "m": "lunch", "f": "12:30", "t": "14:00", "l": "Sunday roast" },
   { "d": "123", "m": "dinner", "f": "18:00", "t": "19:30", "l": "Supper", "n": "Supper in Warburton Hall, Monday to Wednesday" }
  ],
  "g": "unknown",
  "guests": "unknown",
  "src": "https://www.lucy.cam.ac.uk/dining-hall-and-cafe",
  "srcNote": "term time",
  "guestSrc": "https://www.lucy.cam.ac.uk/dining-hall-and-cafe"
 },
