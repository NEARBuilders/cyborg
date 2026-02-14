# Enhanced Create Project Modal Plan

## Goal
Make the "Create Project" experience friendlier with:
1. ✨ **Markdown editor** for rich text descriptions
2. 🖼️ **Image link input** for brand/cover image
3. 👀 **Live preview** - see how the project card will look
4. 📝 **Better UX** for writing longer descriptions

---

## Current Implementation

**Location:** `ui/src/routes/_layout/profile/$accountId.tsx` (lines ~920-1011)

### Current Fields:
```
┌─────────────────────────────────────┐
│ Create New Project                 │
│                                 │
│ Project Name *                   │
│ [My Awesome Project            ]  │
│                                 │
│ Description                     │
│ [Brief description...         ]  │
│ (single line input - not friendly) │
│                                 │
│ Status                          │
│ [Active ▼]                      │
│                                 │
│ [Create Project] [Cancel]          │
└─────────────────────────────────────┘
```

### Problems:
- ❌ Single-line text input for description (hard to write long text)
- ❌ No markdown support
- ❌ No image/cover image option
- ❌ No preview of how project will look
- ❌ Can't add links, lists, or formatting

---

## Proposed Enhancement

### New Modal Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Create New Project                              [━━━━○] Progress?      │
├───────────────────────────────────┬───────────────────────────────────┤
│                                   │                                   │
│  📝 Edit                          │  👁️ Preview                      │
│  ┌──────────────────────────┐     │  ┌───────────────────────────┐  │
│  │ Project Name *          │     │  │  ┌─────────────────────┐  │  │
│  │ [My Awesome Project  ]  │     │  │  │ [COVER IMAGE]        │  │  │
│  │                        │     │  │  │   1200x630 banner    │  │  │
│  │ Cover Image URL 🔗      │     │  │  └─────────────────────┘  │  │
│  │ [https://example.  ]  │     │  │                           │  │
│  │ (optional, for banner)  │     │  │  🏆 My Awesome Project    │  │
│  │                        │     │  │  Active                    │  │
│  │ Description             │     │  │                           │  │
│  │ ┌────────────────────┐ │     │  │  This is a **bold**     │  │
│  │ │ **Bold**          │ │     │  │  description with:        │  │
│  │ │ [List item]       │ │     │  │  • Lists                 │  │
│  │ │ # Header          │ │     │  │  • Links                 │  │
│  │ │ [Link](url)      │ │ │     │  │  • And more!              │  │
│  │ │                  │ │ │     │  │                           │  │
│  │ │                  │ │ │     │  │  Updated Feb 13, 2026     │  │
│  │ └────────────────────┘ │ │     │  └─────────────────────────┘  │
│  │                        │ │     │                                   │
│  │ [Markdown cheatsheet]  │ │     │  💡 This is how your       │
│  │ (click to expand)      │ │     │     project will appear       │
│  │                        │ │ │     │     in the profile list      │
│  │ Status                 │ │     │                                   │
│  │ [● Active ▼]          │ │     │                                   │
│  │                        │ │     │                                   │
│  │                        │ │     │                                   │
│  └──────────────────────────┘ │     │                                   │
│                                   │                                   │
│  [Cancel]                    [Create Project]                              │
└───────────────────────────────────┴───────────────────────────────────┘
```

---

## Detailed Component Plan

### 1. Split-Pane Modal Layout

**File:** `ui/src/components/projects/CreateProjectModal.tsx` (NEW - extract from profile)

```typescript
interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (project: Project) => void;
  accountId: string;
}

Layout:
├── Two-column grid: `grid-cols-1 lg:grid-cols-2`
├── Left: Edit form (scrollable if needed)
├── Right: Live preview (sticky)
└── Responsive: Stacks on mobile, side-by-side on desktop
```

### 2. Enhanced Form Fields

#### 2.1 Project Name (EXISTING - keep as-is)
```tsx
<Input
  label="Project Name"
  value={name}
  onChange={(e) => setName(e.target.value)}
  placeholder="My Awesome Project"
  required
/>
```

#### 2.2 Cover Image URL (NEW)
```tsx
<FormField>
  <FormLabel>Cover Image URL</FormLabel>
  <FormDescription>
    Optional: Add a banner image to showcase your project's brand
  </FormDescription>
  <Input
    type="url"
    value={coverImageUrl}
    onChange={(e) => setCoverImageUrl(e.target.value)}
    placeholder="https://example.com/banner.png"
    leftIcon={<ImageIcon className="size-4" />}
  />
  {coverImageUrl && (
    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
      <CheckCircle className="size-3 text-green-500" />
      Image will be fetched (requires CORS access)
    </div>
  )}
</FormField>
```

**Validation:**
- Must be valid URL format
- Optional field
- Show warning if URL looks broken (optional: fetch HEAD request)

#### 2.3 Markdown Description (NEW - Replace single-line Input)
```tsx
<FormField>
  <FormLabel>Description</FormLabel>
  <FormDescription>
    Use Markdown for formatting. Click the help icon to see options.
  </FormDescription>
  <MarkdownEditor
    value={description}
    onChange={setDescription}
    placeholder="Tell us about your project... Type / for commands"
    rows={12}
    minHeight="300px"
  />
  <Collapsible>
    <CollapsibleTrigger className="text-xs text-primary flex items-center gap-1">
      <HelpCircle className="size-3" />
      Markdown cheatsheet
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-2 p-3 bg-muted rounded text-xs">
      <MarkdownCheatsheet />
    </CollapsibleContent>
  </Collapsible>
</FormField>
```

**Use existing `MarkdownEditor` component from:**
`ui/src/components/ui/markdown-editor.tsx`

#### 2.4 Status (EXISTING - keep as-is)
```tsx
<Select value={status} onValueChange={setStatus}>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="active">🟢 Active</SelectItem>
    <SelectItem value="completed">🔵 Completed</SelectItem>
    <SelectItem value="archived">⚪ Archived</SelectItem>
  </SelectContent>
</Select>
```

### 3. Live Preview Component

**File:** `ui/src/components/projects/ProjectCardPreview.tsx` (NEW)

```typescript
interface ProjectCardPreviewProps {
  name: string;
  description: string;
  status: Project["status"];
  coverImageUrl?: string;
  updatedAt: string;
}

Features:
├── Cover image banner (1200x630 aspect ratio)
├── Fallback gradient if no image
├── Status badge (color-coded)
├── Project name (truncate if long)
├── Rendered markdown description
├── Last updated date
├── "View" button placeholder
└── Hover effects (same as real cards)
```

**Preview Styling:**
```tsx
<div className="relative overflow-hidden rounded-lg border border-border/50 bg-card hover:border-border transition-colors">
  {/* Cover Image Banner */}
  {coverImageUrl ? (
    <div className="aspect-video w-full overflow-hidden bg-muted">
      <img
        src={coverImageUrl}
        alt={name}
        className="w-full h-full object-cover"
        onError={(e) => {
          // Fallback to gradient on error
          e.currentTarget.style.display = 'none';
        }}
      />
    </div>
  ) : (
    <div className="aspect-video w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
      <Code2 className="size-12 text-primary/40" />
    </div>
  )}

  {/* Content */}
  <div className="p-4 space-y-2">
    <div className="flex items-center justify-between">
      <h3 className="font-semibold truncate flex-1">{name || 'Project Name'}</h3>
      <StatusBadge status={status} />
    </div>

    {description ? (
      <div className="text-sm text-muted-foreground line-clamp-3">
        <Markdown content={description} />
      </div>
    ) : (
      <p className="text-sm text-muted-foreground italic">
        Project description will appear here...
      </p>
    )}

    <p className="text-xs text-muted-foreground">
      Updated {new Date().toLocaleDateString()}
    </p>
  </div>
</div>
```

### 4. Markdown Cheatsheet Component

**File:** `ui/src/components/ui/markdown-cheatsheet.tsx` (NEW)

```tsx
export function MarkdownCheatsheet() {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-2">
      <div>
        <code className="text-foreground">**bold**</code>
        <span className="text-muted-foreground"> → bold</span>
      </div>
      <div>
        <code className="text-foreground">*italic*</code>
        <span className="text-muted-foreground"> → italic</span>
      </div>
      <div>
        <code className="text-foreground"># Heading</code>
        <span className="text-muted-foreground"> → Heading 1</span>
      </div>
      <div>
        <code className="text-foreground">- List item</code>
        <span className="text-muted-foreground"> → bullet</span>
      </div>
      <div>
        <code className="text-foreground">[text](url)</code>
        <span className="text-muted-foreground"> → link</span>
      </div>
      <div>
        <code className="text-foreground">`code`</code>
        <span className="text-muted-foreground"> → inline code</span>
      </div>
    </div>
  );
}
```

---

## Database Schema Update

### Add `cover_image_url` to Projects Table

**File:** `api/src/db/schema/schema.ts` (or wherever projects schema is)

```typescript
export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  // ... existing fields ...

  // NEW FIELD
  coverImageUrl: text("cover_image_url"), // Optional banner image URL

  updatedAt: timestamp("updated_at").defaultNow(),
});
```

**Migration:** Create new migration file
```sql
ALTER TABLE projects ADD COLUMN cover_image_url TEXT;
```

### Update Project Interface

**File:** `ui/src/hooks/useProjects.ts`

```typescript
export interface Project {
  id: string;
  nearAccountId: string;
  name: string;
  description: string | null;
  status: "active" | "completed" | "archived";

  // NEW FIELD
  coverImageUrl?: string | null; // Cover/banner image URL

  createdAt: string;
  updatedAt: string;
  transaction?: any;
}
```

---

## Implementation Steps

### Phase 1: Backend Support (Day 1)
- [ ] Add `coverImageUrl` column to projects table
- [ ] Create and run database migration
- [ ] Update API handler to accept `cover_image_url`
- [ ] Update API response to include `cover_image_url`
- [ ] Test with Postman/curl

### Phase 2: Core Components (Day 1-2)
- [ ] Create `ProjectCardPreview` component
- [ ] Create `MarkdownCheatsheet` component
- [ ] Update `Project` interface for new field
- [ ] Update `useCreateProject` hook to pass `coverImageUrl`

### Phase 3: Modal Refactor (Day 2)
- [ ] Extract create modal to separate file
- [ ] Implement two-column layout
- [ ] Replace Input with MarkdownEditor for description
- [ ] Add cover image URL input field
- [ ] Add live preview panel
- [ ] Add markdown cheatsheet collapsible

### Phase 4: Update Display (Day 2)
- [ ] Update `ProfileProjects` component to show cover images
- [ ] Update `/projects/$id` page to show cover image
- [ ] Add fallback gradients when no image
- [ ] Handle image loading errors gracefully

### Phase 5: Polish & Testing (Day 3)
- [ ] Add loading states for image fetching
- [ ] Add URL validation for cover image
- [ ] Test with various image sizes/formats
- [ ] Test markdown rendering with complex content
- [ ] Verify mobile responsiveness
- [ ] Accessibility audit (alt text, keyboard nav)

---

## UX Improvements Summary

### Before:
```
❌ Single-line description input
❌ No markdown support
❌ No visual branding (no image)
❌ No preview - guess how it will look
❌ Small modal, cramped
```

### After:
```
✅ Full markdown editor with preview
✅ Cover image for brand identity
✅ Live card preview - see exactly how it looks
✅ Split-pane modal - spacious and friendly
✅ Markdown cheatsheet built-in
✅ Better UX for longer descriptions
```

---

## Technical Considerations

### Image Handling

**CORS Issues:**
- User-provided URLs might block embedding
- Solution: Use proxy or warn user
- Fallback: Show gradient if image fails to load

**Image Size:**
- Recommend aspect ratio: 16:9 (1200x630)
- CSS `object-fit: cover` for consistent sizing
- Lazy load images in list view

**Storage Options (Future):**
- Direct URLs (current proposal)
- IPFS upload (future enhancement)
- Base64 encoding (not recommended for large images)

### Markdown Security

**XSS Prevention:**
- Use existing `Markdown` component (should sanitize)
- Don't allow `<script>` tags
- Sanitize user input before saving

**Allowed Markdown:**
- Headers, bold, italic, lists
- Links, inline code
- Blockquotes, tables (optional)

### Performance

**Preview Updates:**
- Debounce preview updates (200-300ms)
- Don't re-render on every keystroke
- Use React.memo for Preview component

**Modal Performance:**
- Lazy load MarkdownEditor
- Don't fetch images in preview until valid URL entered
- Collapse markdown cheatsheet by default

---

## File Structure

```
ui/src/
├── components/
│   ├── ui/
│   │   ├── markdown-editor.tsx (EXISTING)
│   │   ├── markdown.tsx (EXISTING)
│   │   └── markdown-cheatsheet.tsx (NEW)
│   │
│   └── projects/
│       ├── CreateProjectModal.tsx (NEW - extract from profile)
│       ├── ProjectCardPreview.tsx (NEW)
│       └── index.ts
│
├── hooks/
│   └── useProjects.ts (UPDATE - add coverImageUrl)
│
├── routes/
│   └── _layout/
│       └── profile/
│           └── $accountId.tsx (UPDATE - use new modal)
│
└── types/
    └── project.ts (UPDATE - add coverImageUrl)
```

---

## Example Flow

### User Creates Project:

1. User clicks "Create Project" button
2. Modal opens with split view
3. User enters name: "My DApp"
4. User pastes cover image URL
5. **Preview updates instantly** showing banner
6. User types description with markdown:
   ```markdown
   ## Features
   - **Fast** transactions
   - [Demo](https://demo.com)
   - `npm install my-dapp`
   ```
7. **Preview shows rendered markdown** in real-time
8. User selects status: "Active"
9. User reviews preview - looks perfect! ✓
10. User clicks "Create Project"
11. Transaction approved, project created
12. Modal closes, project appears in list with cover image

---

## Success Metrics

- [ ] Users can add cover images to projects
- [ ] Users can write rich descriptions with markdown
- [ ] Users see accurate preview before creating
- [ ] Modal is friendlier (measured by UX testing)
- [ ] No increase in errors (markdown, image loading)
- [ ] Mobile users have good experience too

---

## Future Enhancements

1. **Image upload** - Upload directly to IPFS/storage
2. **Emoji picker** - Add emojis to titles/descriptions
3. **Template gallery** - Start from predefined project templates
4. **Auto-save draft** - Save work in progress to localStorage
5. **Multiple images** - Image gallery for projects
6. **Video embeds** - YouTube/Vimeo demo videos
7. **Tags/categories** - Add tags for better organization
8. **Dark/light mode preview** - Toggle between themes in preview
