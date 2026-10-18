# Native AFTER SOURCE12 export grammar response

SOURCE-only narrow repair of the actual diagnostic failure. The old generic export-type scan searched until semicolon and mistook CameraSweep's parameter from for a module clause. New bounded token grammar recognizes only export-star with optional namespace-as plus required from, and balanced export-specifier braces with optional from, after an optional type modifier. A named type alias remains a declaration; the outer traversal still checks nested real import(type)/dynamic expressions. No declaration-wide token skipping and no identifier-wide from suppression.

Two new draft tests cover alias from parameter plus actual nested import type/type-specifier/star dependency edges and omitted dependency failures, and the pinned actual failed01 archived vehicle-camera.ts read-only fixture. Existing regex/division/template/lock/nonliteral/closure tests remain unchanged. Intended40cases, all new checks UNEXECUTED.

Checks07's15raw checkedsource601abf3254 is preserved under native-after-source-original-checked-07. Failed01's155archive/native/failuremarker remain immutable and native-after-02 absent. Product18 unchanged. No native/CLIchild/check/build/browser/Git execution in this round; parser remains conservative lexical edge proof rather than AST/general syntax validation.
