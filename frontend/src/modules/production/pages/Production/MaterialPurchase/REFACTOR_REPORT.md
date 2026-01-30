# MaterialPurchase Module Refactoring Report

## 1. Overview
This report details the modular refactoring of the `MaterialPurchase` module (`frontend/src/modules/production/pages/Production/MaterialPurchase/index.tsx`). The primary goal was to decompose the "God Class" (2858 lines) into smaller, manageable, single-responsibility components while strictly preserving all existing business logic and UI behavior.

## 2. Refactoring Strategy
We adopted a **Controller-View Separation** pattern:
- **Controller (`index.tsx`)**: Retains all state management, data fetching, event handlers, and business logic coordination. This ensures that the complex interactions between different parts of the page (e.g., sync logic, query params, modal states) remain intact and centralized.
- **Views (Components)**: Extracted pure UI rendering logic into stateless (or near-stateless) components. These components receive data and callbacks via props.
- **Shared Resources**: Extracted common types and utility functions to dedicated files.

## 3. Changes Implemented

### 3.1 Directory Structure
The module has been reorganized as follows:
```
MaterialPurchase/
├── components/
│   ├── MaterialSearchForm.tsx       # Filter form logic
│   ├── MaterialTable.tsx            # Main data table
│   └── PurchaseModal/               # Complex Purchase Modal (Split into sub-views)
│       ├── index.tsx                # Modal Wrapper & Footer Logic
│       ├── PurchaseDetailView.tsx   # "View" mode content
│       ├── PurchaseCreateForm.tsx   # "Create" mode content
│       └── PurchasePreviewView.tsx  # "Preview" mode content
├── types/
│   └── index.ts                     # Shared interfaces and type definitions
├── utils/
│   └── index.ts                     # Helper functions (HTML generation, formatting)
├── index.tsx                        # Main Controller
└── styles.css                       # Preserved styles
```

### 3.2 Extracted Modules

#### **Types (`types/index.ts`)**
- Moved `MaterialPurchaseTabKey`, `MaterialDatabaseModalData`.
- Moved Storage Keys constants.
- Consolidates imports from `@/types/production`.

#### **Utils (`utils/index.ts`)**
- Extracted `buildPurchaseSheetHtml` (large HTML string generation logic).
- Extracted `toLocalDateTimeInputValue`, `toDateTimeLocalValue`.
- Extracted `getStatusConfig`, `buildSizePairs`, `getOrderQtyTotal`.

#### **Components**
1.  **`MaterialSearchForm`**: Encapsulates the top filter bar. Receives `queryParams` and `setQueryParams`.
2.  **`MaterialTable`**: Encapsulates the main table. Handles column definitions and rendering.
3.  **`PurchaseModal`**: A complex component that manages the "View", "Create", and "Preview" modes of the purchase dialog.
    - **`PurchaseDetailView`**: The read-only detail view with "Receive" and "Return" buttons.
    - **`PurchaseCreateForm`**: The form for creating new purchase orders.
    - **`PurchasePreviewView`**: The preview table for generating orders from production orders.

### 3.3 Main Controller (`index.tsx`)
- Reduced file size from **2858 lines** to **~1310 lines** (>50% reduction).
- Cleaner imports and simplified render method.
- Preserved all `useEffect` hooks, `useSync` logic, and complex state management (e.g., `orderFrozen`, `activeTabKey`).
- Preserved `MaterialDatabase` related logic (state, handlers) even though it is currently not active in the UI (tab hidden), ensuring no logic loss.

## 4. Verification & Safety
- **Logic Integrity**: No logic was rewritten; code was moved and wrapped. Event handlers in `index.tsx` are passed down to components.
- **UI Integrity**: JSX structure, classes, and styles were copied exactly to the new components.
- **Type Safety**: TypeScript interfaces were extracted and reused to ensure prop type consistency.

## 5. Next Steps
- **Custom Hooks Extraction**: Further clean up `index.tsx` by moving state logic into custom hooks (e.g., `usePurchaseList`, `usePurchaseModalLogic`).
- **Material Database**: The `MaterialDatabase` tab logic exists but is currently hidden/unused in the main view. It can be easily enabled or moved to a separate route if needed.
