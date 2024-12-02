const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const MySQLStore = require('express-mysql-session')(session); // Add MySQL session store
const pool = require('./database'); // Database connection
const billingRoutes = require('./routes/billingRoutes');

const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  console.log('Session data:', req.session); // Logs session information for debugging
  next();
});

// Routes
app.use(billingRoutes);

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
  const { username, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
    await pool.query(query, [username, hashedPassword]);
    console.log(`User ${username} signed up successfully`);
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

    console.log('Session after login:', req.session); // Debug session
    console.log(`User ${username} logged in successfully`);
    res.redirect('/dashboard');
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


// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
