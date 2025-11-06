# Monthly Office Hours - Tight 1-Hour Format

## Agenda Structure
- **10 min**: Product updates & roadmap preview
- **15 min**: Live survival demo with CAI Verify proof
- **20 min**: Community Q&A (pre-submitted questions prioritized)
- **15 min**: 1:1 breakout rooms (Zoom breakout feature)

---

## Office Hours Infrastructure

### 1. Zoom Configuration
```yaml
# SECURE: zoom-settings.yml
meeting:
  id: "${ZOOM_MEETING_ID}"
  password: "${ZOOM_MEETING_PASSWORD}"
  waiting_room: true
  # SECURITY: Additional security settings
  require_password_for_scheduling_new_meetings: true
  embed_password_in_join_link: false
  join_before_host: false
  host_video: true
  participant_video: false  # Participants can enable but not auto-start
  audio_type: "both"  # Telephony and VoIP
  auto_start_type: "video_host"  # Only host video auto-starts
  breakout_rooms:
    enabled: true
    auto_assign: false
    # SECURITY: Breakout room settings
    require_password_for_breakout_rooms: true
    allow_participants_to_choose_room: false
    rooms:
      - name: "WordPress Troubleshooting"
        capacity: 25
        password: "${BREAKOUT_WORDPRESS_PASSWORD}"
      - name: "Shopify Implementation"
        capacity: 25
        password: "${BREAKOUT_SHOPIFY_PASSWORD}"
      - name: "Cloudflare Workers"
        capacity: 25
        password: "${BREAKOUT_CLOUDFLARE_PASSWORD}"
      - name: "Next.js/Fastify"
        capacity: 25
        password: "${BREAKOUT_NEXTJS_PASSWORD}"
      - name: "Compliance & Legal"
        capacity: 25
        password: "${BREAKOUT_COMPLIANCE_PASSWORD}"
      - name: "General Q&A"
        capacity: 25
        password: "${BREAKOUT_GENERAL_PASSWORD}"

recording:
  enabled: true
  auto_record: true
  cloud_recording: true
  # SECURITY: Recording security
  require_password_to_view_recording: true
  recording_password: "${RECORDING_PASSWORD}"
  gallery_view: true
  shared_screen_with_speaker_view: true
  # SECURITY: Recording retention
  auto_delete_recording_after_days: 90

settings:
  # SECURITY: Participant controls
  mute_participants_on_entry: true
  allow_participants_to_unmute_themselves: true
  allow_participants_to_rename_themselves: false
  allow_participants_to_share_screen: false
  meeting_reactions: true
  virtual_backgrounds: true
  closed_captioning: true
  # SECURITY: Additional security
  enable_waiting_room: true
  enable_breakout_room: true
  enable_co_host: true
  enable_authentication: true
  authentication_option: "sign_in_to_zoom"
  authentication_domains: ["c2concierge.com"]
```

### 2. Registration System
```javascript
// SECURE: office-hours-registration.js
class OfficeHoursRegistration {
  constructor() {
    this.maxCapacity = 150;
    this.waitingList = [];
    this.attendees = [];
    this.apiKey = process.env.ZOOM_API_KEY;
    this.apiSecret = process.env.ZOOM_API_SECRET;
  }
  
  // SECURITY: Validate and sanitize inputs
  validateRegistrationData(email, name, company, interests) {
    const errors = [];
    
    if (!email || !this.isValidEmail(email)) {
      errors.push('Valid email is required');
    }
    
    if (!name || typeof name !== 'string' || name.length < 2 || name.length > 100) {
      errors.push('Name must be 2-100 characters');
    }
    
    if (company && (typeof company !== 'string' || company.length > 100)) {
      errors.push('Company must be under 100 characters');
    }
    
    if (interests && (!Array.isArray(interests) || interests.length > 5)) {
      errors.push('Interests must be an array with max 5 items');
    }
    
    return errors;
  }
  
  // SECURITY: Email validation
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  // SECURITY: Sanitize string inputs
  sanitizeString(str) {
    return str
      .trim()
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .substring(0, 100);
  }
  
  async registerParticipant(email, name, company, interests) {
    // SECURITY: Validate inputs
    const validationErrors = this.validateRegistrationData(email, name, company, interests);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }
    
    // SECURITY: Sanitize inputs
    const sanitizedEmail = email.toLowerCase().trim();
    const sanitizedName = this.sanitizeString(name);
    const sanitizedCompany = company ? this.sanitizeString(company) : '';
    const sanitizedInterests = interests ? interests.map(i => this.sanitizeString(i)).filter(Boolean) : [];
    
    // SECURITY: Check for duplicate registration
    if (this.attendees.some(a => a.email === sanitizedEmail)) {
      throw new Error('Email already registered');
    }
    
    if (this.attendees.length >= this.maxCapacity) {
      this.waitingList.push({ 
        email: sanitizedEmail, 
        name: sanitizedName, 
        company: sanitizedCompany, 
        interests: sanitizedInterests, 
        registeredAt: new Date() 
      });
      return { status: 'waitlisted', position: this.waitingList.length };
    }
    
    const participant = {
      id: this.generateSecureId(),
      email: sanitizedEmail,
      name: sanitizedName,
      company: sanitizedCompany,
      interests: sanitizedInterests,
      registeredAt: new Date(),
      zoomJoinUrl: this.generateZoomJoinUrl(sanitizedEmail)
    };
    
    this.attendees.push(participant);
    await this.sendConfirmationEmail(participant);
    
    return { status: 'registered', ...participant };
  }
  
  // SECURITY: Generate secure ID
  generateSecureId() {
    return 'reg_' + require('crypto').randomBytes(16).toString('hex');
  }
  
  async sendConfirmationEmail(participant) {
    // SECURITY: Sanitize email content
    const emailTemplate = this.generateEmailTemplate(participant);
    
    // Use secure email service (implementation depends on your email provider)
    await this.sendSecureEmail({
      to: participant.email,
      subject: `Confirmed: C2 Concierge Office Hours - ${this.getNextSessionDate()}`,
      html: emailTemplate
    });
  }
  
  generateEmailTemplate(participant) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0088CC;">Office Hours Registration Confirmed</h2>
        <p>Hi ${this.escapeHtml(participant.name)},</p>
        <p>You're registered for our monthly Office Hours session!</p>
        
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3>Session Details:</h3>
          <p><strong>Date:</strong> ${this.getNextSessionDate()}</p>
          <p><strong>Time:</strong> 10:00 AM PT / 1:00 PM ET / 6:00 PM GMT</p>
          <p><strong>Duration:</strong> 1 hour</p>
          <p><strong>Join URL:</strong> <a href="${this.escapeHtml(participant.zoomJoinUrl)}">Join Meeting</a></p>
        </div>
        
        <div style="background: #e8f4f8; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3>Agenda:</h3>
          <ul>
            <li>Product updates (10 min)</li>
            <li>Live survival demo (15 min)</li>
            <li>Community Q&A (20 min)</li>
            <li>1:1 breakout rooms (15 min)</li>
          </ul>
        </div>
        
        <p><strong>Security Note:</strong> Please use the secure join link above. Do not share this link with others.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666;">
          This is an automated message. Please do not reply to this email.
        </p>
      </div>
    `;
  }
  
  // SECURITY: HTML escaping for email content
  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  // SECURITY: Secure email sending (implementation depends on provider)
  async sendSecureEmail(options) {
    // Implementation would use your email service API
    // with proper authentication and rate limiting
    console.log('Sending secure email:', options.to);
  }
}
```

### 3. Live Demo System
```javascript
// SECURE: live-demo-manager.js
class LiveDemoManager {
  constructor() {
    this.demos = new Map();
    this.activeDemo = null;
    this.screenshareEnabled = false;
    this.apiKey = process.env.DEMO_API_KEY;
  }
  
  // SECURITY: Initialize demo with validation
  initializeDemo(demoId, config) {
    if (!this.validateDemoConfig(config)) {
      throw new Error('Invalid demo configuration');
    }
    
    const demo = {
      id: demoId,
      title: this.sanitizeString(config.title),
      description: this.sanitizeString(config.description),
      assets: this.validateAssets(config.assets || []),
      startTime: null,
      participants: new Set(),
      status: 'ready'
    };
    
    this.demos.set(demoId, demo);
    return demo;
  }
  
  // SECURITY: Validate demo configuration
  validateDemoConfig(config) {
    if (!config || typeof config !== 'object') {
      return false;
    }
    
    if (!config.title || typeof config.title !== 'string' || config.title.length > 200) {
      return false;
    }
    
    if (config.description && (typeof config.description !== 'string' || config.description.length > 1000)) {
      return false;
    }
    
    return true;
  }
  
  // SECURITY: Validate demo assets
  validateAssets(assets) {
    return assets
      .filter(asset => asset && typeof asset === 'object')
      .filter(asset => asset.url && this.isValidUrl(asset.url))
      .filter(asset => asset.type && ['image', 'video', 'document'].includes(asset.type))
      .map(asset => ({
        ...asset,
        title: asset.title ? this.sanitizeString(asset.title) : 'Untitled',
        description: asset.description ? this.sanitizeString(asset.description) : ''
      }));
  }
  
  // SECURITY: Start demo with authentication
  async startDemo(demoId, authToken) {
    if (!this.validateAuthToken(authToken)) {
      throw new Error('Invalid authentication token');
    }
    
    const demo = this.demos.get(demoId);
    if (!demo) {
      throw new Error('Demo not found');
    }
    
    if (demo.status !== 'ready') {
      throw new Error('Demo is not ready to start');
    }
    
    demo.status = 'active';
    demo.startTime = new Date();
    this.activeDemo = demo;
    
    // Notify participants
    await this.notifyDemoStart(demo);
    
    return demo;
  }
  
  // SECURITY: Validate authentication token
  validateAuthToken(token) {
    return token && typeof token === 'string' && token === this.apiKey;
  }
  
  // SECURITY: Add participant with validation
  addParticipant(demoId, participant) {
    const validationErrors = this.validateParticipant(participant);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid participant: ${validationErrors.join(', ')}`);
    }
    
    const demo = this.demos.get(demoId);
    if (!demo) {
      throw new Error('Demo not found');
    }
    
    const sanitizedParticipant = {
      id: participant.id || this.generateParticipantId(),
      name: this.sanitizeString(participant.name),
      email: participant.email ? this.validateEmail(participant.email) : null,
      role: participant.role || 'viewer',
      joinedAt: new Date()
    };
    
    demo.participants.add(sanitizedParticipant);
    return sanitizedParticipant;
  }
  
  // SECURITY: Validate participant data
  validateParticipant(participant) {
    const errors = [];
    
    if (!participant || typeof participant !== 'object') {
      errors.push('Participant must be an object');
      return errors;
    }
    
    if (!participant.name || typeof participant.name !== 'string' || participant.name.length < 2 || participant.name.length > 100) {
      errors.push('Name must be 2-100 characters');
    }
    
    if (participant.email && !this.isValidEmail(participant.email)) {
      errors.push('Invalid email format');
    }
    
    if (participant.role && !['viewer', 'presenter', 'moderator'].includes(participant.role)) {
      errors.push('Invalid role');
    }
    
    return errors;
  }
  
  // SECURITY: Email validation
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  // SECURITY: URL validation
  isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }
  
  // SECURITY: Sanitize string inputs
  sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str
      .trim()
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .substring(0, 1000);
  }
  
  // SECURITY: Generate secure participant ID
  generateParticipantId() {
    return 'part_' + require('crypto').randomBytes(8).toString('hex');
  }
  
  // SECURITY: Notify demo start
  async notifyDemoStart(demo) {
    // Implementation would use secure notification system
    console.log(`Demo started: ${demo.title}`);
  }
}
    this.initializeDemos();
  }
  
  initializeDemos() {
    this.demos.set('remote-manifest-survival', {
      title: 'Remote Manifest Survival Test',
      description: 'See how remote manifests survive content transformations',
      duration: '15 minutes',
      steps: [
        {
          title: 'Upload with Embedded Manifest',
          action: 'uploadImage',
          expected: 'Manifest embedded in image',
          verifyUrl: null
        },
        {
          title: 'Run Through Optimizer',
          action: 'runOptimizer',
          expected: 'Manifest stripped by optimizer',
          verifyUrl: null
        },
        {
          title: 'Upload with Remote Manifest',
          action: 'uploadRemoteManifest',
          expected: 'Link header points to remote manifest',
          verifyUrl: 'https://contentauthenticity.org/verify?url=DEMO_URL'
        },
        {
          title: 'Optimizer Test - Remote',
          action: 'runOptimizerOnRemote',
          expected: 'Manifest survives optimizer',
          verifyUrl: 'https://contentauthenticity.org/verify?url=DEMO_URL'
        }
      ]
    });
    
    this.demos.set('cloudflare-workers-setup', {
      title: 'Cloudflare Workers Manifest Proxy',
      description: 'Set up edge proxy for C2PA manifests in 5 minutes',
      duration: '15 minutes',
      steps: [
        {
          title: 'Deploy Worker',
          action: 'deployWorker',
          expected: 'Worker deployed and responding',
          verifyUrl: null
        },
        {
          title: 'Configure Manifest Routing',
          action: 'configureRouting',
          expected: 'Link headers added to images',
          verifyUrl: 'https://contentauthenticity.org/verify?url=WORKER_DEMO_URL'
        },
        {
          title: 'Test CDN Edge Cases',
          action: 'testEdgeCases',
          expected: 'Manifests survive through Cloudflare',
          verifyUrl: 'https://contentauthenticity.org/verify?url=WORKER_DEMO_URL'
        }
      ]
    });
  }
  
  async executeDemo(demoId, presenter) {
    const demo = this.demos.get(demoId);
    if (!demo) {
      throw new Error(`Demo ${demoId} not found`);
    }
    
    const results = [];
    
    for (const step of demo.steps) {
      presenter.shareScreen();
      presenter.announceStep(step.title);
      
      const result = await this.executeStep(step);
      results.push(result);
      
      if (step.verifyUrl) {
        const verifyUrl = step.verifyUrl.replace('DEMO_URL', result.assetUrl);
        presenter.showCAIVerify(verifyUrl);
        await this.waitForVerification();
      }
      
      presenter.showResult(result);
    }
    
    return results;
  }
  
  async executeStep(step) {
    switch (step.action) {
      case 'uploadImage':
        return await this.uploadImageWithEmbeddedManifest();
      case 'runOptimizer':
        return await this.runThroughOptimizer();
      case 'uploadRemoteManifest':
        return await this.uploadWithRemoteManifest();
      case 'deployWorker':
        return await this.deployCloudflareWorker();
      default:
        throw new Error(`Unknown action: ${step.action}`);
    }
  }
  
  async uploadImageWithEmbeddedManifest() {
    // Simulate upload with embedded manifest
    const imageUrl = `https://demo.c2concierge.com/embedded-${Date.now()}.jpg`;
    
    return {
      step: 'Upload with Embedded Manifest',
      imageUrl,
      manifestUrl: null, // Embedded
      linkHeader: null,
      expected: 'Manifest embedded in image',
      actual: 'Manifest embedded in image',
      success: true
    };
  }
  
  async uploadWithRemoteManifest() {
    // Simulate upload with remote manifest
    const assetId = `remote-${Date.now()}`;
    const imageUrl = `https://demo.c2concierge.com/${assetId}.jpg`;
    const manifestUrl = `https://cdn.c2concierge.com/manifests/${assetId}.json`;
    
    return {
      step: 'Upload with Remote Manifest',
      imageUrl,
      manifestUrl,
      linkHeader: `<${manifestUrl}>; rel="c2pa-manifest"`,
      expected: 'Link header points to remote manifest',
      actual: 'Link header points to remote manifest',
      success: true,
      verifyUrl: `https://contentauthenticity.org/verify?url=${encodeURIComponent(imageUrl)}`
    };
  }
}
```

### 4. Q&A Management System
```javascript
// qa-management.js
class QAManager {
  constructor() {
    this.questions = [];
    this.submissionDeadline = null;
  }
  
  async submitQuestion(participant, question, category) {
    const submission = {
      id: this.generateId(),
      participantId: participant.id,
      participantName: participant.name,
      question,
      category,
      submittedAt: new Date(),
      upvotes: 0,
      status: 'pending'
    };
    
    this.questions.push(submission);
    await this.notifySubmission(submission);
    
    return submission;
  }
  
  async upvoteQuestion(questionId, participantId) {
    const question = this.questions.find(q => q.id === questionId);
    if (!question) {
      throw new Error('Question not found');
    }
    
    // Check if already upvoted
    if (question.upvotesBy?.includes(participantId)) {
      return question;
    }
    
    question.upvotes = (question.upvotes || 0) + 1;
    question.upvotesBy = [...(question.upvotesBy || []), participantId];
    
    return question;
  }
  
  getPrioritizedQuestions() {
    return this.questions
      .filter(q => q.status === 'pending')
      .sort((a, b) => b.upvotes - a.upvotes)
      .slice(0, 10); // Top 10 questions
  }
  
  async markAsAnswered(questionId, answer, presenter) {
    const question = this.questions.find(q => q.id === questionId);
    if (!question) {
      throw new Error('Question not found');
    }
    
    question.status = 'answered';
    question.answer = answer;
    question.answeredBy = presenter;
    question.answeredAt = new Date();
    
    // Create forum post from Q&A
    await this.createForumPost(question);
    
    return question;
  }
  
  async createForumPost(question) {
    const postContent = `
      **Question**: ${question.question}
      
      **Asked by**: ${question.participantName}
      
      **Answer**: ${question.answer}
      
      **Answered by**: ${question.answeredBy.name} in Office Hours ${new Date().toLocaleDateString()}
      
      **Category**: ${question.category}
      
      **Upvotes**: ${question.upvotes}
      
      ---
      
      This question was answered during our monthly Office Hours session. Join us next month!
      
      Tags: #office-hours #${question.category.replace(/\s+/g, '-')}
    `;
    
    await this.forumClient.createPost({
      title: question.question,
      content: postContent,
      category: this.mapCategoryToForum(question.category),
      tags: ['office-hours', question.category.replace(/\s+/g, '-')]
    });
  }
}
```

### 5. Breakout Room Management
```javascript
// breakout-room-manager.js
class BreakoutRoomManager {
  constructor() {
    this.rooms = new Map();
    this.initializeRooms();
  }
  
  initializeRooms() {
    this.rooms.set('wordpress', {
      name: 'WordPress Troubleshooting',
      experts: ['wp-expert-1', 'wp-expert-2'],
      capacity: 25,
      currentParticipants: 0,
      topics: [
        'Plugin conflicts',
        'CDN configuration',
        'Manifest generation',
        'Link header issues'
      ]
    });
    
    this.rooms.set('shopify', {
      name: 'Shopify Implementation',
      experts: ['shopify-expert-1'],
      capacity: 25,
      currentParticipants: 0,
      topics: [
        'Theme customization',
        'App integration',
        'Meta tag fallbacks',
        'Proxy routes'
      ]
    });
    
    this.rooms.set('cloudflare', {
      name: 'Cloudflare Workers',
      experts: ['cf-expert-1', 'cf-expert-2'],
      capacity: 25,
      currentParticipants: 0,
      topics: [
        'Worker deployment',
        'KV storage',
        'Edge caching',
        'Image resizing'
      ]
    });
    
    this.rooms.set('nextjs-fastify', {
      name: 'Next.js/Fastify',
      experts: ['nodejs-expert-1'],
      capacity: 25,
      currentParticipants: 0,
      topics: [
        'Middleware setup',
        'Static generation',
        'API routes',
        'Plugin development'
      ]
    });
    
    this.rooms.set('compliance', {
      name: 'Compliance & Legal',
      experts: ['legal-expert-1'],
      capacity: 25,
      currentParticipants: 0,
      topics: [
        'EU AI Act compliance',
        'DSA transparency',
        'FTC disclosures',
        'Compliance packs'
      ]
    });
  }
  
  async assignParticipantToRoom(participant, preferences) {
    // Find best room based on preferences and capacity
    let assignedRoom = null;
    
    for (const preference of preferences) {
      const room = this.rooms.get(preference);
      if (room && room.currentParticipants < room.capacity) {
        assignedRoom = room;
        break;
      }
    }
    
    // If no preferred room available, assign to general Q&A
    if (!assignedRoom) {
      assignedRoom = this.rooms.get('general') || this.createGeneralRoom();
    }
    
    assignedRoom.currentParticipants++;
    participant.breakoutRoom = assignedRoom.name;
    
    await this.sendRoomAssignment(participant, assignedRoom);
    
    return assignedRoom;
  }
  
  async sendRoomAssignment(participant, room) {
    const message = `
      You've been assigned to the "${room.name}" breakout room.
      
      Available experts: ${room.experts.join(', ')}
      Topics we'll cover: ${room.topics.join(', ')}
      
      Prepare your questions! We'll start breakout sessions in 5 minutes.
    `;
    
    await this.notificationService.send(participant.id, {
      type: 'breakout-assignment',
      message,
      room: room.name
    });
  }
}
```

### 6. Content Generation Pipeline
```javascript
// office-hours-content.js
class OfficeHoursContentGenerator {
  constructor() {
    this.contentTypes = ['blog-post', 'tutorial', 'code-snippet', 'faq'];
  }
  
  async generateContent(session) {
    const content = [];
    
    // Generate blog post from demo
    const demoBlogPost = await this.generateDemoBlogPost(session.demo);
    content.push(demoBlogPost);
    
    // Generate FAQ from Q&A
    const faqs = await this.generateFAQs(session.qa);
    content.push(...faqs);
    
    // Generate code snippets from solutions
    const snippets = await this.generateCodeSnippets(session.solutions);
    content.push(...snippets);
    
    // Generate tutorial from complex topics
    const tutorial = await this.generateTutorial(session.complexTopics);
    content.push(tutorial);
    
    return content;
  }
  
  async generateDemoBlogPost(demo) {
    return {
      type: 'blog-post',
      title: `Office Hours Demo: ${demo.title}`,
      content: `
        # ${demo.title}
        
        In our latest Office Hours session, we demonstrated ${demo.description}.
        
        ## What We Showed
        
        ${demo.steps.map(step => `
        ### ${step.title}
        
        ${step.explanation}
        
        **Result**: ${step.result}
        
        **CAI Verify Link**: [Verify it yourself](${step.verifyUrl})
        `).join('\n')}
        
        ## Key Takeaways
        
        ${demo.keyTakeaways.map(takeaway => `- ${takeaway}`).join('\n')}
        
        ## Copy-Paste Solution
        
        \`\`\`${demo.codeLanguage}
        ${demo.code}
        \`\`\`
        
        ## Try It Yourself
        
        [Live Demo](${demo.demoUrl}) | [CAI Verify](${demo.verifyUrl})
        
        ---
        
        *This content was generated from our monthly Office Hours session. Join us next month!*
      `,
      tags: ['office-hours', 'demo', demo.category],
      publishAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Publish tomorrow
    };
  }
  
  async generateFAQs(qaSession) {
    const faqs = [];
    
    // Top 5 most upvoted questions become FAQs
    const topQuestions = qaSession.questions
      .filter(q => q.status === 'answered')
      .sort((a, b) => b.upvotes - a.upvotes)
      .slice(0, 5);
    
    for (const question of topQuestions) {
      faqs.push({
        type: 'faq',
        question: question.question,
        answer: question.answer,
        category: question.category,
        upvotes: question.upvotes,
        source: 'office-hours',
        sourceDate: qaSession.date,
        tags: ['office-hours', question.category]
      });
    }
    
    return faqs;
  }
}
```

### 7. Analytics and Metrics
```javascript
// office-hours-analytics.js
class OfficeHoursAnalytics {
  constructor() {
    this.metrics = {
      attendance: [],
      engagement: [],
      conversions: [],
      content: []
    };
  }
  
  trackSession(session) {
    const sessionMetrics = {
      date: session.date,
      registered: session.registeredCount,
      attended: session.attendedCount,
      dropoffRate: this.calculateDropoffRate(session),
      engagement: this.calculateEngagement(session),
      questionsAsked: session.questions.length,
      questionsAnswered: session.questions.filter(q => q.status === 'answered').length,
      breakoutRoomUtilization: this.calculateBreakoutUtilization(session),
      contentGenerated: session.content.length,
      conversionEvents: this.trackConversions(session)
    };
    
    this.metrics.attendance.push(sessionMetrics);
    return sessionMetrics;
  }
  
  calculateEngagement(session) {
    const totalParticipants = session.attendedCount;
    const activeParticipants = session.questions.length + session.breakoutParticipants.length;
    
    return {
      participationRate: (activeParticipants / totalParticipants) * 100,
      averageQuestionsPerParticipant: session.questions.length / totalParticipants,
      breakoutParticipationRate: (session.breakoutParticipants.length / totalParticipants) * 100
    };
  }
  
  trackConversions(session) {
    const conversions = [];
    
    // Track demo to trial signups
    session.demoParticipants.forEach(participant => {
      if (participant.trialSignup) {
        conversions.push({
          type: 'demo-to-trial',
          participant: participant.id,
          timestamp: participant.trialSignupTime,
          source: 'office-hours-demo'
        });
      }
    });
    
    // Track Q&A to forum engagement
    session.questions.forEach(question => {
      if (question.forumFollowUp) {
        conversions.push({
          type: 'qa-to-forum',
          participant: question.participantId,
          timestamp: question.forumFollowUpTime,
          source: 'office-hours-qa'
        });
      }
    });
    
    return conversions;
  }
  
  generateMonthlyReport() {
    const lastMonth = this.getLastMonthSessions();
    
    return {
      period: this.getMonthPeriod(),
      totalSessions: lastMonth.length,
      totalAttendees: lastMonth.reduce((sum, s) => sum + s.attendedCount, 0),
      averageAttendance: lastMonth.reduce((sum, s) => sum + s.attendedCount, 0) / lastMonth.length,
      totalQuestions: lastMonth.reduce((sum, s) => sum + s.questions.length, 0),
      totalContentGenerated: lastMonth.reduce((sum, s) => sum + s.content.length, 0),
      conversionRate: this.calculateOverallConversionRate(lastMonth),
      topTopics: this.getTopTopics(lastMonth),
      recommendations: this.generateRecommendations(lastMonth)
    };
  }
}
```

This office hours system ensures:
- Tight 1-hour format with structured agenda
- Live demos with CAI Verify proofs
- Efficient Q&A with prioritization
- 1:1 breakout rooms for specific help
- Content generation from sessions
- Comprehensive analytics and improvement loops
