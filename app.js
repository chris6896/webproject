const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const MySQLStore = require('express-mysql-session')(session);
const pool = require('./database');
const billingRoutes = require('./routes/billingRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');

const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Secure static file serving for invoices - requires authentication
app.use('/invoices', (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).send('Unauthorized');
  }
  next();
}, express.static(path.join(__dirname, 'invoices')));

// Session Store Configuration
const sessionStore = new MySQLStore({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'billing_system',
});

// Session Middleware
app.use(
  session({
    secret: 'billing-secret-key', // Use a secure key in production
    resave: false,
    saveUninitialized: false, // Don't save empty sessions
    store: sessionStore, // Store sessions in MySQL
    cookie: { secure: false }, // Secure: false for HTTP, true for HTTPS
  })
);

// Test Database Connection
(async () => {
  try {
    const [results] = await pool.query('SELECT 1');
    console.log('Database connection test succeeded:', results);
  } catch (err) {
    console.error('Database connection test failed:', err);
  }
})();

// Debugging Middleware to Log Session Data
app.use((req, res, next) => {
  console.log('Session data:', req.session);
  next();
});

// Routes
app.use(billingRoutes);
app.use(invoiceRoutes);

app.get('/', (req, res) => {
  console.log('Serving index.html');
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/login', (req, res) => {
  console.log('Serving login.html');
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/signup', (req, res) => {
  console.log('Serving signup.html');
  res.sendFile(path.join(__dirname, 'public/signup.html'));
});

app.post('/api/signup', async (req, res) => {
  const { username, password, role } = req.body;

  try {
    if (!['business', 'client'].includes(role)) {
      return res.status(400).send('Invalid role selected.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)';
    await pool.query(query, [username, hashedPassword, role]);
    console.log(`User ${username} signed up successfully as ${role}`);
    res.redirect('/login');
  } catch (error) {
    console.error('Error during signup:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).send('Username already exists.');
    } else {
      res.status(500).send('Error creating user.');
    }
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const query = 'SELECT * FROM users WHERE username = ?';
    const [rows] = await pool.query(query, [username]);

    if (rows.length === 0) {
      console.error(`Login failed: User ${username} not found`);
      return res.status(400).send('User not found.');
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.error(`Login failed: Invalid password for user ${username}`);
      return res.status(400).send('Invalid username or password.');
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;

    console.log('Session after login:', req.session);
    console.log(`User ${username} logged in successfully as ${user.role}`);
    
    if (user.role === 'business') {
      res.redirect('/dashboard');
    } else {
      res.redirect('/client-dashboard');
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).send('Error logging in.');
  }
});

app.get('/dashboard', (req, res) => {
  if (!req.session.userId) {
    console.log('Unauthorized access to dashboard. Redirecting to login.');
    return res.redirect('/login');
  }
  console.log(`Serving dashboard.html for userId: ${req.session.userId}`);
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.get('/generate-invoice', (req, res) => {
  if (!req.session.userId) {
    console.log('Unauthorized access to generate-invoice page. Redirecting to login.');
    return res.redirect('/login');
  }
  console.log(`Serving generate-invoice.html for userId: ${req.session.userId}`);
  res.sendFile(path.join(__dirname, 'public/generate-invoice.html'));
});

app.get('/client-dashboard', (req, res) => {
  if (req.session.role !== 'client') {
    console.log('Unauthorized access to client dashboard. Redirecting to login.');
    return res.redirect('/login');
  }
  console.log(`Serving client-dashboard.html for userId: ${req.session.userId}`);
  res.sendFile(path.join(__dirname, 'public/client-dashboard.html'));
});

app.get('/create', (req, res) => {
  if (!req.session.userId) {
    console.log('Unauthorized access to create page. Redirecting to login.');
    return res.redirect('/login');
  }
  console.log(`Serving create.html for userId: ${req.session.userId}`);
  res.sendFile(path.join(__dirname, 'public/create.html'));
});

app.get('/logout', (req, res) => {
  console.log(`Logging out userId: ${req.session.userId}`);
  req.session.destroy(() => {
    console.log('Session destroyed. Redirecting to index.');
    res.redirect('/');
  });
});

app.get('/edit', (req, res) => {
  if (!req.session.userId) {
    console.log('Unauthorized access to edit page. Redirecting to login.');
    return res.redirect('/login');
  }
  console.log(`Serving edit.html for userId: ${req.session.userId}`);
  res.sendFile(path.join(__dirname, 'public/edit.html'));
});

app.get('/view-invoice', (req, res) => {
  if (!req.session.userId) {
    console.log('Unauthorized access to view invoice. Redirecting to login.');
    return res.redirect('/login');
  }
  console.log(`Serving view_invoice.html for userId: ${req.session.userId}`);
  res.sendFile(path.join(__dirname, 'public/view_invoice.html'));
});

// Profile route
app.get('/profile', (req, res) => {
  if (!req.session.userId) {
    console.log('Unauthorized access to profile page. Redirecting to login.');
    return res.redirect('/login');
  }
  console.log(`Serving profile.html for userId: ${req.session.userId}`);
  res.sendFile(path.join(__dirname, 'public/profile.html'));
});

// API route to update username
app.post('/api/profile/username', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { username } = req.body;

  try {
    // Check if username already exists
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [username, req.session.userId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Update username
    await pool.query(
      'UPDATE users SET username = ? WHERE id = ?',
      [username, req.session.userId]
    );

    // Update session
    req.session.username = username;

    res.json({ message: 'Username updated successfully' });
  } catch (error) {
    console.error('Error updating username:', error);
    res.status(500).json({ error: 'Error updating username' });
  }
});

// API route to update password
app.post('/api/profile/password', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { currentPassword, newPassword } = req.body;

  try {
    // Get current user
    const [users] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [req.session.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.session.userId]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: 'Error updating password' });
  }
});

// Secure route for serving invoice PDFs
app.get('/api/invoices/:userId/:clientId/:filename', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const { userId, clientId, filename } = req.params;
    
    // Verify this user has access to this invoice
    const [invoice] = await pool.query(
      'SELECT * FROM invoices WHERE user_id = ? AND client_id = ? AND pdf_path = ?',
      [userId, clientId, filename]
    );

    if (!invoice.length) {
      return res.status(404).send('Invoice not found');
    }

    // Construct the full path to the PDF
    const pdfPath = path.join(__dirname, 'invoices', userId, clientId, filename);
    
    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).send('PDF file not found');
    }

    // Set the content type and send the file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(pdfPath).pipe(res);

  } catch (error) {
    console.error('Error serving PDF:', error);
    res.status(500).send('Error retrieving PDF');
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});