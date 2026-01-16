---
name: privacy-audit
description: Review code for HIPAA compliance and privacy best practices
---

# Privacy & HIPAA Compliance Audit

When this skill is invoked, perform a comprehensive privacy and security audit for healthcare/elderly care compliance:

## What to Check:

### 1. Data Encryption
- ✅ Data encrypted at rest (database, file storage)
- ✅ Data encrypted in transit (HTTPS, TLS 1.2+)
- ✅ No sensitive data in logs
- ✅ No credentials in code or config files
- ❌ Check for hardcoded secrets, API keys

### 2. Authentication & Authorization
- ✅ Strong password requirements
- ✅ Multi-factor authentication (especially for caregivers)
- ✅ Session management (timeout, secure cookies)
- ✅ Role-based access control (caregiver vs family)
- ✅ Audit trail for access to senior data

### 3. Data Minimization
- Only collect necessary data
- Clear data retention policies
- Ability to delete/anonymize data
- No unnecessary PHI (Protected Health Information) collection

### 4. HIPAA-Specific Requirements
- ✅ Business Associate Agreements (BAA) for third parties
- ✅ Breach notification procedures
- ✅ Patient rights (access, amendment, accounting)
- ✅ Minimum necessary standard
- ✅ Privacy notices and consent

### 5. Third-Party Services
- Verify HIPAA compliance of:
  - Twilio (voice calls) - BAA required
  - Anthropic (AI conversations) - BAA required
  - Database hosting (AWS, etc.) - BAA required
  - Analytics services - must be HIPAA compliant

### 6. Conversation Data
- ✅ Call recordings encrypted and access-controlled
- ✅ Conversation transcripts protected
- ✅ AI model doesn't retain conversation data
- ✅ Clear data ownership (senior/caregiver)
- ✅ Deletion process for old conversations

### 7. Code Security
- No SQL injection vulnerabilities
- Input validation and sanitization
- Secure API endpoints
- Rate limiting to prevent abuse
- Error messages don't leak sensitive info

## Red Flags to Catch:

```typescript
// ❌ BAD: Logging sensitive data
console.log('Senior data:', senior);

// ❌ BAD: No input validation
app.post('/api/seniors', (req, res) => {
  db.query(`INSERT INTO seniors VALUES (${req.body.data})`);
});

// ❌ BAD: Weak authentication
if (password === storedPassword) { ... }

// ❌ BAD: Exposing internal IDs
res.json({ seniorId: '12345', ssn: '...' });
```

## Good Patterns to Look For:

```typescript
// ✅ GOOD: Sanitized logging
logger.info('Senior updated', { seniorId: senior.id });

// ✅ GOOD: Parameterized queries
db.query('INSERT INTO seniors VALUES ($1, $2)', [name, phone]);

// ✅ GOOD: Hashed passwords
const hash = await bcrypt.hash(password, 10);

// ✅ GOOD: Limited data exposure
res.json({ id: senior.id, name: senior.name });
```

## Report Format:

- 🔒 **Security**: Authentication, authorization, encryption
- 🏥 **HIPAA Compliance**: Specific requirements
- 📊 **Data Handling**: Collection, storage, deletion
- ⚠️ **Vulnerabilities**: Critical issues found
- 💡 **Recommendations**: How to fix issues

## Example Usage:
```
/privacy-audit
```

This will scan the codebase for privacy and security issues with detailed recommendations.
