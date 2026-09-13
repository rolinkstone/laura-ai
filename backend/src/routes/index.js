const express = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const roleRoutes = require('./role.routes');
const documentRoutes = require('./document.routes');
const sourceRoutes = require('./source.routes');
const faqRoutes = require('./faq.routes');
const chatRoutes = require('./chat.routes');
const feedbackRoutes = require('./feedback.routes');
const knowledgeBaseRoutes = require('./knowledgeBase.routes');
const ragRoutes = require('./rag.routes');
const publicRoutes = require('./public.routes');
const categoryRoutes = require('./category.routes');
const adminRoutes = require('./admin.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/documents', documentRoutes);
router.use('/sources', sourceRoutes);
router.use('/faq', faqRoutes);
router.use('/categories', categoryRoutes);
router.use('/chat', chatRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/knowledge-base', knowledgeBaseRoutes);
router.use('/rag', ragRoutes);
router.use('/public', publicRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
