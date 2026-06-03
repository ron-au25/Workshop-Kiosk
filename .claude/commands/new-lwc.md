# New LWC Component

Create a new Lightning Web Component for this Workshop Kiosk project following the patterns established in this codebase.

## Usage

`/new-lwc <component-name> [description]`

## What to do

1. **Create four files** under `force-app/main/default/lwc/<componentName>/`:
   - `<componentName>.js` — component logic
   - `<componentName>.html` — template
   - `<componentName>.css` — styles using the project CSS variable system
   - `<componentName>.js-meta.xml` — metadata with `apiVersion: 66.0`, `isExposed: false`

2. **JS scaffold rules**:
   - Use `import { LightningElement, api, track } from 'lwc';`
   - Any Apex method called must use the JSON string pattern: accept `String thingJson` in Apex and pass `JSON.stringify({...})` from LWC — never pass plain objects or inner classes as `@AuraEnabled` parameters (they deserialise with all nulls)
   - All `<input>`, `<textarea>`, `<select>` event handlers must call `evt.stopPropagation()` on `onkeydown` to prevent the global barcode scanner from stealing keystrokes
   - If the component needs to go full-screen, it should dispatch a `back` CustomEvent to return to the parent
   - Token prop: `@api sessionToken` — pass to every Apex call as `token: this.sessionToken`

3. **CSS rules**:
   - Use the project CSS variable palette exclusively (no hardcoded colours):
     ```
     --rt-surface          #131A22  (card backgrounds)
     --rt-surface-2        #1B2530  (input backgrounds, rows)
     --rt-surface-3        #243040  (hover states)
     --rt-border           #2A3744
     --rt-text             #F2F5F7
     --rt-text-muted       #A6B2BD
     --rt-text-dim         #6B7A89
     --rt-accent           #E25822  (primary CTA, Rio Tinto orange)
     --rt-accent-2         #2E8FE6  (secondary CTA, blue)
     --rt-success          #21C07A
     --rt-warning          #F2B441
     --rt-danger           #E84B4B
     ```
   - Dark theme, no light-mode variants needed
   - Spinner pattern: `border-top-color: var(--rt-accent)` on a 48px circle with `animation: spin 0.8s linear infinite`
   - Buttons follow the sizing conventions: primary action 52–64px height, icon buttons 36px

4. **HTML rules**:
   - LWC conditional rendering: `lwc:if` / `lwc:elseif` / `lwc:else` (not `if:true`)
   - Lists: `for:each={items} for:item="item"` with mandatory `key={item.id}`
   - Always add `onkeydown={handleInputKeydown}` to every `<input>`, `<textarea>`, `<select>`

5. **Register in parent** if it needs to appear in an existing view:
   - Add `<c-<component-name>>` in the parent HTML with required `@api` props
   - If it's a full-screen overlay (like Work Execution), use `lwc:if={showComponentName}` toggled by a button and listen for the `back` event

6. **Permission set** — if the component touches a new custom object, add object + field permissions to `Workshop_Kiosk_Supervisor.permissionset-meta.xml`

7. **Deploy**:
   ```bash
   sf project deploy start -d force-app/main/default/lwc/<componentName> -o rsnov25demo
   # bump VERSION in kioskSidebar.js (v1.X → v1.X+1)
   sf project deploy start -d force-app/main/default/lwc/kioskSidebar -o rsnov25demo
   sf community publish --name "workshop Portal" -o rsnov25demo
   ```

## Common gotchas from this project

- **Apex inner class deserialization**: `@AuraEnabled(cacheable=false) static MyDTO myMethod(String token, String reqJson)` — always deserialise: `MyDTO req = (MyDTO) JSON.deserialize(reqJson, MyDTO.class);`
- **Shadow DOM event retargeting**: `evt.target` at a parent component boundary is retargeted to the child host. Use `evt.composedPath()[0]` to get the real inner element and check `tagName` before redirecting focus (e.g. the barcode scanner handler in `workshopPortal.js`)
- **`user-select: none` blocks typing**: The kiosk root has `user-select: none` for touch UX. Form elements need the CSS override already in `workshopPortal.css`, but also always add the `onkeydown` propagation guard directly on the input element — belt and braces
- **LWC reactivity timing**: Capture `@track` values into local `const` variables before passing to `async` methods — don't read `this.dateFrom` inside an `await`ed call path, as reactivity re-renders may have changed it by then
- **No modal pattern**: This kiosk uses full-screen component swaps (controlled by `showExecution`, `showDetail`, etc. flags in parent), not modals or drawers
