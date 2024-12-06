const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pool = require('../database');

// Middleware to check user authentication
const isAuthenticated = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

// Endpoint to fetch current user details
router.get('/api/user', isAuthenticated, async (req, res) => {
  try {
    if (req.session.username) {
      res.json({ username: req.session.username });
    } else {
      res.status(401).json({ error: 'User not authenticated' });
    }
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Error fetching user details' });
  }
});

// Endpoint to fetch all entries for the logged-in user
router.get('/api/entries', isAuthenticated, async (req, res) => {
  try {
    const [entries] = await pool.query(
      'SELECT * FROM billing_entries WHERE user_id = ?',
      [req.session.userId]
    );
    res.json({ entries });
  } catch (error) {
    console.error('Error fetching billing entries:', error);
    res.status(500).json({ error: 'Error fetching billing entries' });
  }
});

// Endpoint to delete an entry by ID
router.get('/api/delete/:id', isAuthenticated, async (req, res) => {
  try {
    const entryId = req.params.id;
    const [result] = await pool.query(
      'DELETE FROM billing_entries WHERE id = ? AND user_id = ?',
      [entryId, req.session.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    res.json({ message: 'Entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting billing entry:', error);
    res.status(500).json({ error: 'Error deleting billing entry' });
  }
});

// Endpoint to fetch all invoices for the logged-in user
router.get('/api/invoices', isAuthenticated, async (req, res) => {
  try {
    const [invoices] = await pool.query(
      `SELECT i.*, 
              u.username as client_name,
              DATE_ADD(i.created_at, INTERVAL i.due_days DAY) as due_date
       FROM invoices i
       LEFT JOIN users u ON i.client_id = u.id
       WHERE i.user_id = ?
       ORDER BY i.created_at DESC`,
      [req.session.userId]
    );
    res.json({ invoices });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Error fetching invoices' });
  }
});

// Endpoint to fetch a single invoice by ID
// Endpoint to fetch a single invoice by ID
router.get('/api/invoice/:id', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = req.params.id;
      console.log('Fetching invoice with ID:', invoiceId);
      console.log('User ID from session:', req.session.userId);
      
      const query = `
        SELECT i.*, 
               u.username as client_name,
               b.business_name,
               DATE_ADD(i.created_at, INTERVAL i.due_days DAY) as due_date
        FROM invoices i
        LEFT JOIN users u ON i.client_id = u.id
        LEFT JOIN business_info b ON b.user_id = i.user_id
        WHERE i.id = ? AND (i.user_id = ? OR i.client_id = ?)`;
      
      console.log('Executing query:', query);
      console.log('With parameters:', [invoiceId, req.session.userId, req.session.userId]);
      
      const [invoiceData] = await pool.query(query, [invoiceId, req.session.userId, req.session.userId]);
      
      console.log('Raw invoice data retrieved:', JSON.stringify(invoiceData, null, 2));
  
      if (invoiceData.length === 0) {
        console.log('No invoice found with these parameters');
        return res.status(404).json({ error: 'Invoice not found' });
      }
  
      const invoice = invoiceData[0];
      console.log('Sending invoice data:', JSON.stringify(invoice, null, 2));
      console.log('=======================================');
  
      res.json(invoice);
    } catch (error) {
      console.error('Error in /api/invoice/:id route:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ error: 'Error fetching invoice details' });
    }
  });  

// Endpoint to generate an invoice
router.post('/api/generate-invoice', isAuthenticated, async (req, res) => {
  const { clientId, dueDays, items } = req.body;

  try {
    const [clientData] = await pool.query('SELECT * FROM users WHERE id = ?', [clientId]);
    if (!clientData.length) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    const invoiceNumber = await getNextInvoiceNumber();
    const totalAmount = items.reduce((sum, item) => {
      return sum + parseFloat(item.quantity) * parseFloat(item.rate);
    }, 0);

    const invoicePath = path.join(__dirname, `../invoices/${req.session.userId}/${clientId}`);
    fs.mkdirSync(invoicePath, { recursive: true });

    const pdfDoc = new PDFDocument();
    const pdfFileName = `INV-${invoiceNumber}-${clientId}-${Date.now()}.pdf`;
    const pdfFilePath = path.join(invoicePath, pdfFileName);

    pdfDoc.pipe(fs.createWriteStream(pdfFilePath));

    // Header
    pdfDoc.fontSize(20).text('INVOICE', { align: 'center' });
    pdfDoc.moveDown();

    // Client and business info
    pdfDoc.fontSize(12);
    pdfDoc.text(`Invoice Number: ${invoiceNumber}`);
    pdfDoc.text(`Date: ${new Date().toLocaleDateString()}`);
    pdfDoc.text(`Due Days: ${dueDays}`);
    pdfDoc.moveDown();
    pdfDoc.text(`From: ${req.session.username}`);
    pdfDoc.text(`To: ${clientData[0].username}`);
    pdfDoc.moveDown();

    // Items
    items.forEach((item, index) => {
      pdfDoc.text(`${index + 1}. ${item.service_product}`);
      pdfDoc.text(`   Quantity: ${item.quantity}`);
      pdfDoc.text(`   Rate: $${parseFloat(item.rate).toFixed(2)}`);
      pdfDoc.text(`   Amount: $${(parseFloat(item.quantity) * parseFloat(item.rate)).toFixed(2)}`);
      if (item.description) {
        pdfDoc.text(`   Description: ${item.description}`);
      }
      pdfDoc.moveDown();
    });

    pdfDoc.text(`Total Amount: $${totalAmount.toFixed(2)}`, { underline: true });
    pdfDoc.end();

    const [result] = await pool.query(
      `INSERT INTO invoices (invoice_number, user_id, client_id, due_days, total_amount, pdf_path)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [invoiceNumber, req.session.userId, clientId, dueDays, totalAmount, pdfFileName]
    );

    res.status(201).json({
      message: 'Invoice generated successfully.',
      invoiceId: result.insertId
    });
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Error generating invoice.' });
  }
});

// Function to get the next invoice number
async function getNextInvoiceNumber() {
  const [result] = await pool.query('SELECT MAX(invoice_number) as maxInvoice FROM invoices');
  return (result[0].maxInvoice || 0) + 1;
}
// Endpoint to fetch all invoices assigned to the logged-in client
router.get('/api/invoices/client', isAuthenticated, async (req, res) => {
    try {
      if (req.session.role !== 'client') {
        return res.status(403).json({ error: 'Access denied. Only clients can access this resource.' });
      }
  
      const [invoices] = await pool.query(
        `SELECT i.*, 
                u.username AS business_name,
                DATE_ADD(i.created_at, INTERVAL i.due_days DAY) AS due_date
         FROM invoices i
         LEFT JOIN users u ON i.user_id = u.id
         WHERE i.client_id = ?
         ORDER BY i.created_at DESC`,
        [req.session.userId]
      );
  
      res.json({ invoices });
    } catch (error) {
      console.error('Error fetching client invoices:', error);
      res.status(500).json({ error: 'Error fetching client invoices.' });
    }
  });
  

module.exports = router;
