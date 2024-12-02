const express = require('express');
const router = express.Router();
const pool = require('../database'); // Correct relative path

// Middleware for authentication
const isAuthenticated = (req, res, next) => {
  console.log('Session Data in Middleware:', req.session); // Debug session
  if (!req.session || !req.session.userId) {
    console.log('User not authenticated. Redirecting to /login');
    return res.redirect('/login');
  }
  next();
};

// Fetch all entries
router.get('/api/entries', isAuthenticated, async (req, res) => {
  try {
    console.log('Fetching entries for userId:', req.session.userId);
    const [entries] = await pool.query(
      'SELECT * FROM billing_entries WHERE user_id = ?',
      [req.session.userId]
    );
    console.log('Entries retrieved:', entries); // Debugging entries
    res.json({ username: req.session.username, entries });
  } catch (error) {
    console.error('Error fetching entries:', error);
    res.status(500).json({ error: 'Error fetching entries.' });
  }
});

// Fetch a single entry by ID
router.get('/api/entry/:id', isAuthenticated, async (req, res) => {
  try {
    console.log(`Fetching entry with ID: ${req.params.id}`);
    const [entry] = await pool.query(
      'SELECT * FROM billing_entries WHERE id = ? AND user_id = ?',
      [req.params.id, req.session.userId]
    );
    if (!entry.length) {
      return res.status(404).json({ error: 'Entry not found.' });
    }
    res.json(entry[0]);
  } catch (error) {
    console.error('Error fetching entry:', error);
    res.status(500).send('Error fetching entry.');
  }
});

// Create a new entry
router.post('/api/create', isAuthenticated, async (req, res) => {
  const { service_product, quantity, rate, description } = req.body; // No price
  try {
    console.log('Creating entry for userId:', req.session.userId);
    await pool.query(
      'INSERT INTO billing_entries (user_id, service_product, quantity, rate, description) VALUES (?, ?, ?, ?, ?)', // No price
      [req.session.userId, service_product, quantity, rate, description] // No price
    );
    console.log('Entry created successfully');
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error creating entry:', error);
    res.status(500).send('Error creating entry.');
  }
});

// Update an entry
router.post('/api/edit', isAuthenticated, async (req, res) => {
  const { id, service_product, quantity, rate, description } = req.body; // No price
  try {
    console.log(`Updating entry with ID: ${id}`);
    await pool.query(
      'UPDATE billing_entries SET service_product = ?, quantity = ?, rate = ?, description = ? WHERE id = ? AND user_id = ?', // No price
      [service_product, quantity, rate, description, id, req.session.userId] // No price
    );
    console.log('Entry updated successfully');
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error updating entry:', error);
    res.status(500).send('Error updating entry.');
  }
});

// Delete an entry
router.get('/api/delete/:id', isAuthenticated, async (req, res) => {
  try {
    console.log(`Deleting entry with ID: ${req.params.id}`);
    await pool.query('DELETE FROM billing_entries WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.session.userId,
    ]);
    console.log('Entry deleted successfully');
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error deleting entry:', error);
    res.status(500).send('Error deleting entry.');
  }
});

module.exports = router;
