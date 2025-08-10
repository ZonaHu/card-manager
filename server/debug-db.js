const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('Checking database...');

// Check if users table exists and what data is in it
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('Error getting tables:', err);
    return;
  }
  
  console.log('Tables:', tables.map(t => t.name));
  
  // Check users table structure
  db.all("PRAGMA table_info(users)", (err, columns) => {
    if (err) {
      console.error('Error getting users table info:', err);
      return;
    }
    
    console.log('Users table columns:', columns);
    
    // Check users data
    db.all("SELECT * FROM users", (err, users) => {
      if (err) {
        console.error('Error getting users:', err);
        return;
      }
      
      console.log('Users data:', users);
      
      // Test the specific query that's failing
      const userId = 1;
      db.get('SELECT country, preferred_currency FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
          console.error('Error with preferences query:', err);
        } else {
          console.log('Preferences query result:', user);
        }
        
        db.close();
      });
    });
  });
});