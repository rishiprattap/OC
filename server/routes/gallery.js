/**
 * Offstage Creators — Event Gallery Routes
 * Public and Admin endpoints for managing event gallery photos.
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { run, get, all } = require('../db');
const config = require('../config');

// Multer memory storage (allows seamless persistence to Postgres on both Vercel & local)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per image
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/gif'];
    if (allowed.includes(file.mimetype.toLowerCase())) cb(null, true);
    else cb(new Error('Only JPG, PNG, WebP, and GIF images are allowed.'));
  }
});

// Admin authentication middleware
function requireAdmin(req, res, next) {
  const secretHeader = (req.headers['x-admin-secret'] || req.headers['x-admin-key'] || '').trim();
  const expectedSecret = (config.ADMIN_SECRET || '').trim();
  const passwordHeader = (req.headers['x-admin-password'] || '').trim();
  const expectedPassword = (config.ADMIN_PASSWORD || '').trim();

  const isSecretMatch = (expectedSecret && secretHeader === expectedSecret) ||
                        (expectedPassword && (secretHeader === expectedPassword || passwordHeader === expectedPassword));

  if ((req.session && req.session.adminAuthenticated) || isSecretMatch) {
    if (!req.session) req.session = {};
    if (!req.session.adminAuthenticated) {
      req.session.adminAuthenticated = true;
      req.session.adminEmail = config.ADMIN_EMAIL || 'admin@offstagecreators.com';
    }
    return next();
  }
  return res.status(401).json({ success: false, error: 'Unauthorized. Please log in as admin.' });
}

// ─── HANDLERS ───────────────────────────────────────────────────────────────

// Handler: List public published images
async function handlePublicList(req, res) {
  try {
    const rows = await all(
      `SELECT * FROM gallery_images WHERE is_published = 1 ORDER BY display_order ASC, id DESC`
    );

    const images = (rows || []).map(r => ({
      id: r.id,
      imageUrl: r.image_url,
      caption: r.caption || '',
      displayOrder: r.display_order,
      isPublished: Boolean(r.is_published),
      createdAt: r.created_at
    }));

    return res.json({
      success: true,
      count: images.length,
      images
    });
  } catch (err) {
    console.error('[Gallery] Public list error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve gallery photos.' });
  }
}

// Handler: List all images for admin (including unpublished)
async function handleAdminList(req, res) {
  try {
    const rows = await all(
      `SELECT * FROM gallery_images ORDER BY display_order ASC, id DESC`
    );

    const images = (rows || []).map(r => ({
      id: r.id,
      imageUrl: r.image_url,
      caption: r.caption || '',
      displayOrder: r.display_order,
      isPublished: Boolean(r.is_published),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    return res.json({
      success: true,
      count: images.length,
      images
    });
  } catch (err) {
    console.error('[Gallery Admin] List error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load gallery items.' });
  }
}

// Handler: Upload images
async function handleUpload(req, res) {
  try {
    const now = new Date().toISOString();
    const createdImages = [];
    const defaultCaption = (req.body.caption || '').trim();

    // 1. Handle file uploads (multipart)
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const mimeType = file.mimetype || 'image/jpeg';
        const base64Data = file.buffer.toString('base64');
        const imageUrl = `data:${mimeType};base64,${base64Data}`;

        const result = await run(
          `INSERT INTO gallery_images (image_url, caption, display_order, is_published, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
          [imageUrl, defaultCaption, 0, 1, now, now]
        );

        createdImages.push({
          id: result.lastID,
          imageUrl,
          caption: defaultCaption,
          displayOrder: 0,
          isPublished: true,
          createdAt: now
        });
      }
    } 
    // 2. Handle direct URL or JSON payload
    else if (req.body.imageUrl || req.body.url) {
      const url = (req.body.imageUrl || req.body.url).trim();
      const caption = (req.body.caption || '').trim();
      if (!url) {
        return res.status(400).json({ success: false, error: 'No image file or URL provided.' });
      }

      const result = await run(
        `INSERT INTO gallery_images (image_url, caption, display_order, is_published, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [url, caption, 0, 1, now, now]
      );

      createdImages.push({
        id: result.lastID,
        imageUrl: url,
        caption,
        displayOrder: 0,
        isPublished: true,
        createdAt: now
      });
    } else {
      return res.status(400).json({ success: false, error: 'Please select at least one image file or provide an image URL.' });
    }

    return res.json({
      success: true,
      message: `Successfully added ${createdImages.length} image(s) to the gallery.`,
      images: createdImages
    });

  } catch (err) {
    console.error('[Gallery Admin] Upload error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to upload gallery images.' });
  }
}

// Handler: Update image
async function handleUpdate(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid image ID.' });

    const existing = await get(`SELECT * FROM gallery_images WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Gallery image not found.' });

    const now = new Date().toISOString();
    const caption = req.body.caption !== undefined ? String(req.body.caption).trim() : existing.caption;
    const isPublished = req.body.isPublished !== undefined
      ? (req.body.isPublished ? 1 : 0)
      : (req.body.is_published !== undefined ? (req.body.is_published ? 1 : 0) : existing.is_published);
    const displayOrder = req.body.displayOrder !== undefined ? Number(req.body.displayOrder) : existing.display_order;

    await run(
      `UPDATE gallery_images SET caption = ?, is_published = ?, display_order = ?, updated_at = ? WHERE id = ?`,
      [caption, isPublished, displayOrder, now, id]
    );

    return res.json({
      success: true,
      message: 'Gallery image updated successfully.',
      image: {
        id,
        imageUrl: existing.image_url,
        caption,
        isPublished: Boolean(isPublished),
        displayOrder,
        updatedAt: now
      }
    });

  } catch (err) {
    console.error('[Gallery Admin] Update error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update gallery image.' });
  }
}

// Handler: Delete image
async function handleDelete(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid image ID.' });

    const existing = await get(`SELECT id FROM gallery_images WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Gallery image not found.' });

    await run(`DELETE FROM gallery_images WHERE id = ?`, [id]);

    return res.json({
      success: true,
      message: 'Gallery image deleted successfully.'
    });

  } catch (err) {
    console.error('[Gallery Admin] Delete error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete gallery image.' });
  }
}

// Handler: Reorder images
async function handleReorder(req, res) {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, error: 'Expected order array of IDs.' });
    }

    const now = new Date().toISOString();
    for (let index = 0; index < order.length; index++) {
      const id = parseInt(order[index], 10);
      if (id) {
        await run(`UPDATE gallery_images SET display_order = ?, updated_at = ? WHERE id = ?`, [index, now, id]);
      }
    }

    return res.json({ success: true, message: 'Gallery order updated successfully.' });

  } catch (err) {
    console.error('[Gallery Admin] Reorder error:', err);
    return res.status(500).json({ success: false, error: 'Failed to reorder gallery images.' });
  }
}

// ─── ROUTE ATTACHMENTS ──────────────────────────────────────────────────────

// GET list: public published or admin all depending on mount/path
router.get('/', (req, res, next) => {
  if (req.baseUrl.includes('/admin')) {
    return requireAdmin(req, res, () => handleAdminList(req, res));
  }
  return handlePublicList(req, res);
});
router.get(['/admin', '/admin/list', '/list'], requireAdmin, handleAdminList);

// Admin actions (accepts both with and without /admin subpath)
router.post(['/upload', '/admin/upload'], requireAdmin, upload.array('images', 20), handleUpload);
router.put(['/:id', '/admin/:id'], requireAdmin, handleUpdate);
router.delete(['/:id', '/admin/:id'], requireAdmin, handleDelete);
router.post(['/reorder', '/admin/reorder'], requireAdmin, handleReorder);

module.exports = router;
