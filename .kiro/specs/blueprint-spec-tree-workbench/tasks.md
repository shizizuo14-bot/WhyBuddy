# SPEC Tree Workbench Task List

- [x] 1. Define tree and node models
  - [x] 1.1 Define SpecTree, SpecNode, and TreeVersion
  - [x] 1.2 Define node type, priority, risk, and dependency fields
  - [x] 1.3 Record route mapping relationships

- [x] 2. Implement route-to-tree deduction
  - [x] 2.1 Convert the selected primary path into the main trunk
  - [x] 2.2 Preserve alternative routes as branches or candidate nodes
  - [x] 2.3 Generate the initial tree snapshot

- [x] 3. Implement the tree workbench UI
  - [x] 3.1 Display the tree structure
  - [x] 3.2 Provide a node inspector
  - [x] 3.3 Provide a version timeline

- [x] 4. Implement tree editing and save flows
  - [x] 4.1 Support add, delete, move, merge, and split actions
  - [x] 4.2 Support saving TreeVersion snapshots
  - [x] 4.3 Support setting a saved version as the current tree

- [x] 5. Write tests
  - [x] 5.1 Tree deduction tests
  - [x] 5.2 Node editing tests
  - [x] 5.3 Version save and restore tests
