(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,23261,e=>{"use strict";var t=e.i(43476),s=e.i(71645),a=e.i(18566),r=e.i(21018),i=e.i(14077),l=e.i(24009),n=e.i(20755),d=e.i(84026),c=e.i(66595),o=e.i(58925),x=e.i(56420);let m={name:"lock-open",size:24,node:[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 9.9-1",key:"1mm8w8"}]],aliases:["unlock"]};m.node;let p=(0,x.default)(m);var u=e.i(82303),b=e.i(51757),_=e.i(83967);let h={name:"smartphone",size:24,node:[["rect",{width:"14",height:"20",x:"5",y:"2",rx:"2",ry:"2",key:"1yt0o3"}],["path",{d:"M12 18h.01",key:"mhygvu"}]]};h.node;let N=(0,x.default)(h),f={name:"copy",size:24,node:[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]};f.node;let E=(0,x.default)(f);var v=e.i(89664),g=e.i(41120),k=e.i(32781),y=e.i(53138),j=e.i(95140),z=e.i(92870);let T={name:"code-xml",size:24,node:[["path",{d:"m18 16 4-4-4-4",key:"1inbqp"}],["path",{d:"m6 8-4 4 4 4",key:"15zrgr"}],["path",{d:"m14.5 4-5 16",key:"e7oirm"}]],aliases:["code-2"]};T.node;let R=(0,x.default)(T);var w=e.i(63676),I=e.i(59659);let O=`-- ========================================================
-- 1. ฟังก์ชันให้ Admin ตั้งรหัส PIN ใหม่ให้บุคลากร
-- ========================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.admin_reset_user_pin(
  p_employee_code TEXT,
  p_new_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_code_clean TEXT;
  v_code_hex TEXT := '';
  v_email TEXT;
  v_new_password TEXT;
  v_staff_roster_id UUID;
  v_full_name TEXT;
  v_position TEXT;
  v_role TEXT := 'staff';
  i INT;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = TRUE
      AND (role = 'admin' OR LOWER(TRIM(employee_code)) = 'admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN', 'message', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ดำเนินการนี้ได้');
  END IF;

  PERFORM set_config('app.admin_provisioning', 'true', TRUE);

  v_code_clean := LOWER(TRIM(p_employee_code));

  IF v_code_clean IS NULL OR v_code_clean = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CODE', 'message', 'กรุณาระบุเลขที่เงินเดือน');
  END IF;

  IF p_new_pin IS NULL OR LENGTH(TRIM(p_new_pin)) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PIN', 'message', 'รหัส PIN ต้องมีอย่างน้อย 4 หลัก');
  END IF;

  -- แปลงเลขที่เงินเดือนเป็น Hex ตามสูตรระบบ auth
  FOR i IN 1..LENGTH(v_code_clean) LOOP
    v_code_hex := v_code_hex || LPAD(TO_HEX(ASCII(SUBSTRING(v_code_clean, i, 1))), 2, '0');
  END LOOP;

  v_email := 'emp_' || v_code_hex || '@nurse-leave.internal';
  v_new_password := 'pwd_' || v_code_hex || '_pin_' || TRIM(p_new_pin);

  -- ดึงข้อมูลชื่อและตำแหน่งเพื่อป้องกัน NOT NULL constraint ใน profiles
  IF v_code_clean = 'admin' THEN
    v_full_name := 'ผู้ดูแลระบบกลาง';
    v_position := 'nurse';
    v_role := 'admin';
  ELSE
    SELECT id, full_name, position INTO v_staff_roster_id, v_full_name, v_position
    FROM public.staff_roster
    WHERE order_number::text = v_code_clean
       OR LOWER(TRIM(order_number::text)) = v_code_clean
       OR LOWER(TRIM(full_name)) = v_code_clean;

    IF v_full_name IS NULL THEN
      SELECT staff_roster_id, full_name, position INTO v_staff_roster_id, v_full_name, v_position
      FROM public.profiles
      WHERE id = v_user_id OR LOWER(TRIM(employee_code)) = v_code_clean;
    END IF;

    v_full_name := COALESCE(v_full_name, 'เจ้าหน้าที่ ' || p_employee_code);
    v_position := COALESCE(v_position, 'nurse');
    v_role := 'staff';
  END IF;

  -- 1. ค้นหา user จาก auth.users ด้วย email หรือจาก profiles ด้วย employee_code
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE LOWER(TRIM(employee_code)) = v_code_clean;
  END IF;

  -- 2. อัปเดตหรือสร้างผู้ใช้ใน auth.users พร้อม auth.identities
  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(v_new_password, extensions.gen_salt('bf', 10)),
        email = v_email,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        updated_at = NOW()
    WHERE id = v_user_id OR email = v_email;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user_id) THEN
      INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_user_id, v_user_id::text,
        format('{"sub":"%s","email":"%s"}', v_user_id::text, v_email)::jsonb,
        'email', NOW(), NOW(), NOW()
      );
    END IF;
  ELSE
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(v_new_password, extensions.gen_salt('bf', 10)),
      NOW(),
      '',
      '',
      '',
      '',
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
        'employee_code', p_employee_code,
        'staff_roster_id', v_staff_roster_id,
        'full_name', v_full_name,
        'position', v_position,
        'role', v_role
      ),
      NOW(),
      NOW()
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id, v_user_id::text,
      format('{"sub":"%s","email":"%s"}', v_user_id::text, v_email)::jsonb,
      'email', NOW(), NOW(), NOW()
    );
  END IF;

  -- 3. เคลียร์โปรไฟล์เก่าที่ผูก employee_code ซ้ำซ้อน (ถ้ามี)
  DELETE FROM public.profiles
  WHERE LOWER(TRIM(employee_code)) = v_code_clean AND id != v_user_id;

  -- 4. Upsert โปรไฟล์ให้พร้อมใช้งาน (ใส่ full_name, position, role ให้ครบถ้วน)
  INSERT INTO public.profiles (
    id,
    staff_roster_id,
    employee_code,
    full_name,
    position,
    role,
    active,
    current_session_token,
    session_expires_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_staff_roster_id,
    p_employee_code,
    v_full_name,
    v_position,
    v_role,
    TRUE,
    NULL,
    NULL,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET employee_code = EXCLUDED.employee_code,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      position = COALESCE(EXCLUDED.position, public.profiles.position),
      role = EXCLUDED.role,
      active = TRUE,
      current_session_token = NULL,
      session_expires_at = NULL,
      updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'employee_code', p_employee_code,
    'message', 'ตั้งรหัส PIN ใหม่สำหรับเลขที่เงินเดือน ' || p_employee_code || ' เรียบร้อยแล้ว (PIN ใหม่: ' || TRIM(p_new_pin) || ')'
  );
END;
$$;

-- 2. ฟังก์ชันปลดล็อกเครื่อง (Clear Stuck Device Session)
CREATE OR REPLACE FUNCTION public.admin_clear_user_session(
  p_employee_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_code_clean TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = TRUE
      AND (role = 'admin' OR LOWER(TRIM(employee_code)) = 'admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN', 'message', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ดำเนินการนี้ได้');
  END IF;

  v_code_clean := LOWER(TRIM(p_employee_code));

  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE LOWER(TRIM(employee_code)) = v_code_clean;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NOT_FOUND',
      'message', 'ไม่พบข้อมูลเลขที่เงินเดือน ' || p_employee_code
    );
  END IF;

  UPDATE public.profiles
  SET current_session_token = NULL,
      session_expires_at = NULL,
      updated_at = NOW()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'employee_code', p_employee_code,
    'message', 'ปลดล็อกเซสชันอุปกรณ์ของเลขที่เงินเดือน ' || p_employee_code || ' เรียบร้อยแล้ว'
  );
END;
$$;

-- 3. ฟังก์ชันล้างข้อมูล User ทดสอบออกจาก auth.users และ profiles เพื่อเริ่มใช้งานจริง
CREATE OR REPLACE FUNCTION public.admin_wipe_test_auth_users()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = TRUE
      AND (role = 'admin' OR LOWER(TRIM(employee_code)) = 'admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN', 'message', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ดำเนินการนี้ได้');
  END IF;

  -- ลบ user ทดสอบใน auth.users ยกเว้น admin
  DELETE FROM auth.users
  WHERE email NOT LIKE '%admin%' 
    AND email != 'emp_61646d696e@nurse-leave.internal';

  -- ลบ profiles ของ user ที่ไม่ใช่ admin
  DELETE FROM public.profiles
  WHERE employee_code != 'admin';

  -- ลบการจองทั้งหมด
  DELETE FROM public.leave_bookings
  WHERE TRUE;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ล้างผู้ใช้ทดสอบใน auth.users และข้อมูลการจองเรียบร้อยแล้ว'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_user_pin(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_clear_user_session(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_wipe_test_auth_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_pin(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_user_session(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_wipe_test_auth_users() TO authenticated;`;e.s(["default",0,function(){let e=(0,a.useRouter)(),{user:x,profile:m,isAdmin:h,loading:f}=(0,r.useAuth)(),[T,L]=(0,s.useState)([]),[S,C]=(0,s.useState)(!0),[U,A]=(0,s.useState)(""),[D,F]=(0,s.useState)("all"),[M,W]=(0,s.useState)(null),[X,H]=(0,s.useState)("1234"),[P,$]=(0,s.useState)(!1),[B,G]=(0,s.useState)(null),[V,K]=(0,s.useState)(null),[q,Q]=(0,s.useState)(null),[Y,J]=(0,s.useState)(l.DEFAULT_DAILY_BOOKING_LIMIT),[Z,ee]=(0,s.useState)(String(l.DEFAULT_DAILY_BOOKING_LIMIT)),[et,es]=(0,s.useState)(!0),[ea,er]=(0,s.useState)(!1),[ei,el]=(0,s.useState)(null);(0,s.useEffect)(()=>{let e=!0;return(0,l.getDailyBookingLimit)().then(t=>{e&&(J(t),ee(String(t)))}).finally(()=>{e&&es(!1)}),()=>{e=!1}},[]);let en=async()=>{let e=Number(Z);er(!0);try{let t=await (0,l.setDailyBookingLimit)(e);el(t.success?"บันทึกโควตาต่อวันแล้ว":t.message||"บันทึกไม่สำเร็จ"),t.success&&J(e)}catch{el("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง")}finally{er(!1)}},[ed,ec]=(0,s.useState)(!1),[eo,ex]=(0,s.useState)(!1);(0,s.useEffect)(()=>{f||x&&h||e.replace("/calendar")},[f,x,h,e]);let em=(0,s.useCallback)(async()=>{C(!0);try{let e=await (0,i.getAdminStaffList)();L(e)}catch{}finally{C(!1)}},[]);(0,s.useEffect)(()=>{em();let e=(0,n.createClient)(),t=e.channel("admin-profiles-sync").on("postgres_changes",{event:"*",schema:"public",table:"profiles"},()=>{em()}).subscribe();return()=>{e.removeChannel(t)}},[em]);let ep=(0,s.useMemo)(()=>{let e=U.trim().toLowerCase();return T.filter(t=>!!(!e||t.full_name.toLowerCase().includes(e)||t.employee_code.toLowerCase().includes(e)||t.official_title&&t.official_title.toLowerCase().includes(e))&&("registered"===D?t.is_registered:"unregistered"===D?!t.is_registered:"nurse"===D?"nurse"===t.position:"assistant"!==D||"assistant"===t.position))},[T,U,D]),eu=(0,s.useMemo)(()=>{let e=T.length,t=T.filter(e=>e.is_registered).length;return{total:e,registered:t,unregistered:e-t,activeSessions:T.filter(e=>e.has_active_session).length}},[T]),eb=async e=>{if(e.preventDefault(),!M)return;if(!X||X.trim().length<4)return void K("รหัส PIN ต้องมีอย่างน้อย 4 หลัก");$(!0),K(null),G(null);let t=await (0,i.adminResetUserPin)(M.employee_code,X.trim());if($(!1),t.error){K(t.error),t.missingRpc&&ec(!0);return}G(t.message||`ตั้งรหัส PIN ใหม่เป็น "${X}" สำเร็จแล้ว`),em()},e_=async e=>{if(!confirm(`ต้องการปลดล็อกอุปกรณ์สำหรับคุณ "${e.full_name}" (เลขที่: ${e.employee_code}) หรือไม่?`))return;Q(e.employee_code);let t=await (0,i.adminClearUserSession)(e.employee_code);(Q(null),t.error)?alert(`เกิดข้อผิดพลาด: ${t.error}`):(alert(t.message||"ปลดล็อกเครื่องเรียบร้อยแล้ว"),em())},[eh,eN]=(0,s.useState)(!1),ef=async()=>{if(confirm("⚠️ คำเตือน: คุณต้องการล้างรายการจองปัจจุบันและบัญชีทดสอบ เพื่อเริ่มใช้งานจริงใช่หรือไม่?\n\n- รายการจองที่ยังใช้งานอยู่จะถูกลบ\n- บัญชีผู้ใช้ทดสอบและโปรไฟล์ที่ไม่ใช่ Admin จะถูกลบ\n- บัญชี Admin ประวัติที่เก็บถาวร และการตั้งค่าโควตาจะคงอยู่")){eN(!0);try{let e=await (0,i.adminWipeAllStaffProfiles)();e.error?alert(`เกิดข้อผิดพลาด: ${e.error}`):(alert("✨ ล้างรายการจองปัจจุบันและบัญชีทดสอบเรียบร้อยแล้ว พร้อมเริ่มใช้งานจริง!"),await em())}catch(e){alert(e instanceof Error?e.message:"เกิดข้อผิดพลาด")}finally{eN(!1)}}};return f||!h?(0,t.jsxs)("div",{className:"min-h-[70vh] flex flex-col items-center justify-center gap-3",children:[(0,t.jsx)(k.Loader2,{className:"w-8 h-8 text-teal-600 animate-spin"}),(0,t.jsx)("p",{className:"text-sm text-zinc-500 font-medium",children:"กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ..."})]}):(0,t.jsxs)("div",{className:"max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6",children:[(0,t.jsxs)("div",{className:"flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800",children:[(0,t.jsxs)("div",{children:[(0,t.jsxs)("div",{className:"inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 mb-2",children:[(0,t.jsx)(d.ShieldCheck,{className:"w-4 h-4 text-amber-600"}),"ระบบผู้ดูแลระบบ (Admin Management)"]}),(0,t.jsx)("h1",{className:"text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight",children:"จัดการผู้ใช้งาน & ตั้งรหัส PIN"}),(0,t.jsx)("p",{className:"text-sm text-zinc-500 dark:text-zinc-400 mt-1",children:"ดูรายชื่อบุคลากรทั้งหมด, รีเซ็ตรหัส PIN สำหรับผู้ที่ลืมรหัส, และปลดล็อกเซสชันอุปกรณ์"})]}),(0,t.jsxs)("div",{className:"flex items-center gap-2.5 shrink-0 flex-wrap",children:[(0,t.jsxs)("button",{type:"button",onClick:ef,disabled:eh||S,className:"inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-bold text-rose-700 dark:text-rose-300 transition-colors shadow-2xs cursor-pointer disabled:opacity-50",title:"ล้างข้อมูลการจองและข้อมูลทดสอบทั้งหมด เพื่อเริ่มใช้งานจริง",children:[eh?(0,t.jsx)(k.Loader2,{className:"w-4 h-4 animate-spin"}):(0,t.jsx)(I.Trash2,{className:"w-4 h-4 text-rose-600"}),"ล้างข้อมูลเตรียมใช้จริง"]}),(0,t.jsxs)("button",{type:"button",onClick:()=>ec(!0),className:"inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-300 transition-colors shadow-2xs cursor-pointer",children:[(0,t.jsx)(R,{className:"w-4 h-4 text-teal-600"}),"คำสั่ง SQL Supabase"]}),(0,t.jsxs)("button",{type:"button",onClick:em,disabled:S,className:"inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-md shadow-teal-600/20 active:scale-95 disabled:opacity-50 cursor-pointer",children:[(0,t.jsx)(g.RefreshCw,{className:`w-4 h-4 ${S?"animate-spin":""}`}),"รีเฟรชข้อมูล"]})]})]}),(0,t.jsxs)("section",{className:"flex flex-col sm:flex-row sm:items-end gap-3 p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800",children:[(0,t.jsxs)("div",{className:"flex-1",children:[(0,t.jsx)("h2",{className:"font-bold text-zinc-900 dark:text-zinc-100",children:"โควตาจองรวมต่อวัน"}),(0,t.jsxs)("p",{className:"text-xs text-zinc-500 mt-1",children:["จำนวนสูงสุดรวมพยาบาลและผู้ช่วย โดย OFF และ Vacation นับรวมกัน (ปัจจุบัน ",Y," คน)"]}),(0,t.jsx)("p",{className:"text-xs text-amber-700 dark:text-amber-300 mt-1",children:"หากลดโควตาต่ำกว่าจำนวนที่จองไว้ ระบบจะเก็บรายการเดิมและงดรับจองเพิ่มจนกว่าจำนวนผู้จองจะต่ำกว่าค่าใหม่"}),ei&&(0,t.jsx)("p",{role:"status",className:"text-xs text-teal-700 dark:text-teal-300 mt-2",children:ei})]}),(0,t.jsxs)("label",{className:"text-xs font-semibold text-zinc-600 dark:text-zinc-300",children:["คนต่อวัน (1–100)",(0,t.jsx)("input",{type:"number",min:1,max:100,step:1,value:Z,disabled:et||ea,onChange:e=>ee(e.target.value),className:"block mt-1 w-28 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm disabled:opacity-50"})]}),(0,t.jsx)("button",{type:"button",onClick:en,disabled:et||ea,className:"px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold disabled:opacity-50",children:et?"กำลังโหลด…":ea?"กำลังบันทึก…":"บันทึกโควตา"})]}),(0,t.jsxs)("div",{className:"grid grid-cols-2 sm:grid-cols-4 gap-4",children:[(0,t.jsxs)("div",{className:"p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-medium mb-2",children:[(0,t.jsx)("span",{children:"บุคลากรทั้งหมด"}),(0,t.jsx)(u.Users,{className:"w-4 h-4 text-teal-600"})]}),(0,t.jsxs)("div",{className:"text-2xl font-black text-zinc-900 dark:text-zinc-100",children:[eu.total," ",(0,t.jsx)("span",{className:"text-xs font-normal text-zinc-500",children:"คน"})]})]}),(0,t.jsxs)("div",{className:"p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between text-emerald-600 text-xs font-medium mb-2",children:[(0,t.jsx)("span",{children:"ลงทะเบียนแล้ว"}),(0,t.jsx)(b.CheckCircle2,{className:"w-4 h-4"})]}),(0,t.jsxs)("div",{className:"text-2xl font-black text-emerald-600 dark:text-emerald-400",children:[eu.registered," ",(0,t.jsx)("span",{className:"text-xs font-normal text-zinc-500",children:"คน"})]})]}),(0,t.jsxs)("div",{className:"p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between text-zinc-500 text-xs font-medium mb-2",children:[(0,t.jsx)("span",{children:"ยังไม่ลงทะเบียน"}),(0,t.jsx)(_.XCircle,{className:"w-4 h-4 text-zinc-400"})]}),(0,t.jsxs)("div",{className:"text-2xl font-black text-zinc-600 dark:text-zinc-300",children:[eu.unregistered," ",(0,t.jsx)("span",{className:"text-xs font-normal text-zinc-500",children:"คน"})]})]}),(0,t.jsxs)("div",{className:"p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between text-sky-600 text-xs font-medium mb-2",children:[(0,t.jsx)("span",{children:"มีเครื่องล็อกอินอยู่"}),(0,t.jsx)(N,{className:"w-4 h-4"})]}),(0,t.jsxs)("div",{className:"text-2xl font-black text-sky-600 dark:text-sky-400",children:[eu.activeSessions," ",(0,t.jsx)("span",{className:"text-xs font-normal text-zinc-500",children:"เครื่อง"})]})]})]}),(0,t.jsxs)("div",{className:"flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800",children:[(0,t.jsxs)("div",{className:"relative flex-1",children:[(0,t.jsx)(c.Search,{className:"w-4 h-4 text-zinc-400 absolute left-3.5 top-3"}),(0,t.jsx)("input",{type:"text",value:U,onChange:e=>A(e.target.value),placeholder:"ค้นหาชื่อ, สกุล หรือเลขที่เงินเดือน...",className:"w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500"})]}),(0,t.jsx)("div",{className:"flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0",children:[{id:"all",label:"ทั้งหมด"},{id:"registered",label:"ลงทะเบียนแล้ว"},{id:"unregistered",label:"ยังไม่ลง"},{id:"nurse",label:"พยาบาล"},{id:"assistant",label:"ผู้ช่วย"}].map(e=>(0,t.jsx)("button",{type:"button",onClick:()=>F(e.id),className:`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${D===e.id?"bg-teal-600 text-white shadow-2xs":"bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 border border-zinc-200 dark:border-zinc-700"}`,children:e.label},e.id))})]}),(0,t.jsx)("div",{className:"overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs",children:(0,t.jsx)("div",{className:"overflow-x-auto",children:(0,t.jsxs)("table",{className:"w-full text-left border-collapse text-sm",children:[(0,t.jsx)("thead",{children:(0,t.jsxs)("tr",{className:"border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/75 dark:bg-zinc-800/50 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400",children:[(0,t.jsx)("th",{className:"py-3 px-4",children:"เลขที่เงินเดือน"}),(0,t.jsx)("th",{className:"py-3 px-4",children:"ชื่อ - นามสกุล"}),(0,t.jsx)("th",{className:"py-3 px-4",children:"ตำแหน่ง"}),(0,t.jsx)("th",{className:"py-3 px-4 text-center",children:"สถานะลงทะเบียน"}),(0,t.jsx)("th",{className:"py-3 px-4 text-center",children:"เซสชันอุปกรณ์"}),(0,t.jsx)("th",{className:"py-3 px-4 text-right",children:"การจัดการ"})]})}),(0,t.jsx)("tbody",{className:"divide-y divide-zinc-100 dark:divide-zinc-800",children:0===ep.length?(0,t.jsx)("tr",{children:(0,t.jsx)("td",{colSpan:6,className:"py-12 text-center text-zinc-500 text-sm",children:"ไม่พบข้อมูลบุคลากรที่ตรงกับคำค้นหา"})}):ep.map(e=>{let s="nurse"===e.position,a=q===e.employee_code;return(0,t.jsxs)("tr",{className:"hover:bg-zinc-50/75 dark:hover:bg-zinc-800/40 transition-colors",children:[(0,t.jsx)("td",{className:"py-3.5 px-4 font-mono font-bold text-xs text-teal-700 dark:text-teal-400",children:e.employee_code}),(0,t.jsxs)("td",{className:"py-3.5 px-4",children:[(0,t.jsxs)("div",{className:"font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5",children:[e.full_name,e.is_admin&&(0,t.jsx)("span",{className:"px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",children:"Admin"})]}),e.official_title&&(0,t.jsx)("div",{className:"text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-xs",children:e.official_title})]}),(0,t.jsx)("td",{className:"py-3.5 px-4",children:(0,t.jsxs)("span",{className:`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${s?"bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300":"bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`,children:[s?(0,t.jsx)(j.Stethoscope,{className:"w-3 h-3"}):(0,t.jsx)(z.UserCheck,{className:"w-3 h-3"}),s?"พยาบาล":"ผู้ช่วย"]})}),(0,t.jsx)("td",{className:"py-3.5 px-4 text-center",children:e.is_registered?(0,t.jsxs)("span",{className:"inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",children:[(0,t.jsx)(b.CheckCircle2,{className:"w-3.5 h-3.5"}),"ลงทะเบียนแล้ว"]}):(0,t.jsxs)("span",{className:"inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",children:[(0,t.jsx)(_.XCircle,{className:"w-3.5 h-3.5 text-zinc-400"}),"ยังไม่ลงทะเบียน"]})}),(0,t.jsx)("td",{className:"py-3.5 px-4 text-center",children:e.has_active_session?(0,t.jsxs)("span",{className:"inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800",children:[(0,t.jsx)(N,{className:"w-3.5 h-3.5"}),"เข้าใช้งานอยู่"]}):(0,t.jsx)("span",{className:"text-xs text-zinc-400",children:"-"})}),(0,t.jsx)("td",{className:"py-3.5 px-4 text-right",children:(0,t.jsxs)("div",{className:"flex items-center justify-end gap-1.5",children:[(0,t.jsxs)("button",{type:"button",onClick:()=>{W(e),H("1234"),K(null),G(null)},className:`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${e.is_registered?"bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800":"bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800"}`,title:e.is_registered?"ตั้งรหัส PIN ใหม่":"ลงทะเบียนและตั้งรหัส PIN ให้",children:[(0,t.jsx)(o.KeyRound,{className:"w-3.5 h-3.5"}),e.is_registered?"รีเซ็ต PIN":"ตั้งรหัส PIN"]}),e.is_registered&&e.has_active_session&&(0,t.jsxs)("button",{type:"button",onClick:()=>e_(e),disabled:a,className:"inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50",title:"ปลดล็อกเซสชันอุปกรณ์",children:[a?(0,t.jsx)(k.Loader2,{className:"w-3.5 h-3.5 animate-spin"}):(0,t.jsx)(p,{className:"w-3.5 h-3.5"}),"ปลดล็อก"]})]})})]},e.id)})})]})})}),M&&(0,t.jsx)("div",{className:"fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in",children:(0,t.jsxs)("div",{className:"relative w-full max-w-md p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-5",children:[(0,t.jsx)("button",{type:"button",onClick:()=>W(null),className:"absolute right-4 top-4 p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer",children:(0,t.jsx)(w.X,{className:"w-5 h-5"})}),(0,t.jsxs)("div",{children:[(0,t.jsxs)("div",{className:"inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 mb-2",children:[(0,t.jsx)(o.KeyRound,{className:"w-3.5 h-3.5"}),"ตั้งรหัส PIN ใหม่"]}),(0,t.jsx)("h3",{className:"text-lg font-extrabold text-zinc-900 dark:text-zinc-100",children:"รีเซ็ตรหัส PIN ให้บุคลากร"}),(0,t.jsx)("p",{className:"text-xs text-zinc-500 mt-1",children:"คุณกำลังตั้งรหัส PIN ใหม่สำหรับ:"}),(0,t.jsxs)("div",{className:"mt-2 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700",children:[(0,t.jsx)("div",{className:"text-sm font-bold text-zinc-900 dark:text-zinc-100",children:M.full_name}),(0,t.jsxs)("div",{className:"text-xs text-zinc-500 font-mono mt-0.5",children:["เลขที่เงินเดือน: ",(0,t.jsx)("span",{className:"font-bold text-teal-600",children:M.employee_code})]})]})]}),B&&(0,t.jsxs)("div",{className:"p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 font-semibold flex items-center gap-2",children:[(0,t.jsx)(b.CheckCircle2,{className:"w-4 h-4 text-emerald-600 shrink-0"}),(0,t.jsx)("span",{children:B})]}),V&&(0,t.jsxs)("div",{className:"p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 space-y-2",children:[(0,t.jsxs)("div",{className:"flex items-center gap-2 font-bold",children:[(0,t.jsx)(y.AlertTriangle,{className:"w-4 h-4 text-rose-600 shrink-0"}),(0,t.jsx)("span",{children:V})]}),(0,t.jsx)("button",{type:"button",onClick:()=>ec(!0),className:"text-xs font-bold text-teal-700 dark:text-teal-400 underline cursor-pointer",children:"คลิกที่นี่เพื่อดูคำสั่ง SQL ติดตั้งใน Supabase"})]}),(0,t.jsxs)("form",{onSubmit:eb,className:"space-y-4",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("label",{className:"block text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-1.5",children:"รหัส PIN ใหม่ (4-6 หลัก)"}),(0,t.jsxs)("div",{className:"relative",children:[(0,t.jsx)(o.KeyRound,{className:"w-5 h-5 text-teal-600 absolute left-4 top-3"}),(0,t.jsx)("input",{type:"text",inputMode:"numeric",maxLength:6,required:!0,value:X,onChange:e=>H(e.target.value),placeholder:"เช่น 1234",className:"w-full pl-12 pr-4 py-2.5 rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-base font-mono font-bold tracking-wider text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"})]}),(0,t.jsxs)("div",{className:"flex items-center gap-2 mt-2",children:[(0,t.jsx)("span",{className:"text-[11px] text-zinc-500 font-medium",children:"ทางลัดรหัสเริ่มต้น:"}),(0,t.jsx)("button",{type:"button",onClick:()=>H("1234"),className:"px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 cursor-pointer",children:"1234"}),(0,t.jsx)("button",{type:"button",onClick:()=>H("0000"),className:"px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 cursor-pointer",children:"0000"})]})]}),(0,t.jsxs)("div",{className:"flex items-center justify-end gap-2 pt-2",children:[(0,t.jsx)("button",{type:"button",onClick:()=>W(null),className:"px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer",children:"ปิด"}),(0,t.jsxs)("button",{type:"submit",disabled:P,className:"px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-md shadow-teal-600/20 active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer",children:[P?(0,t.jsx)(k.Loader2,{className:"w-4 h-4 animate-spin"}):(0,t.jsx)(o.KeyRound,{className:"w-4 h-4"}),"บันทึก PIN ใหม่"]})]})]})]})}),ed&&(0,t.jsx)("div",{className:"fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in",children:(0,t.jsxs)("div",{className:"relative w-full max-w-2xl max-h-[90vh] flex flex-col p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-4",children:[(0,t.jsx)("button",{type:"button",onClick:()=>ec(!1),className:"absolute right-4 top-4 p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer",children:(0,t.jsx)(w.X,{className:"w-5 h-5"})}),(0,t.jsxs)("div",{children:[(0,t.jsxs)("div",{className:"inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-300 mb-2",children:[(0,t.jsx)(R,{className:"w-3.5 h-3.5"}),"คำสั่ง SQL สำหรับ Supabase"]}),(0,t.jsx)("h3",{className:"text-lg font-extrabold text-zinc-900 dark:text-zinc-100",children:"ติดตั้งฟังก์ชัน admin_reset_user_pin ใน Supabase"}),(0,t.jsxs)("p",{className:"text-xs text-zinc-500 mt-1",children:["คัดลอกโค้ดด้านล่างนี้ ไปวางใน Supabase Dashboard > SQL Editor แล้วกดปุ่ม ",(0,t.jsx)("strong",{children:"Run"})," (ทำเพียงครั้งเดียว)"]})]}),(0,t.jsx)("div",{className:"relative flex-1 min-h-0 overflow-y-auto rounded-2xl bg-zinc-950 p-4 font-mono text-xs text-emerald-400 border border-zinc-800",children:(0,t.jsx)("pre",{className:"whitespace-pre-wrap leading-relaxed",children:O})}),(0,t.jsxs)("div",{className:"flex items-center justify-between pt-2",children:[(0,t.jsx)("span",{className:"text-xs text-zinc-500",children:eo?"✓ คัดลอกสำเร็จแล้ว":"กดปุ่มเพื่อคัดลอก SQL ทั้งหมด"}),(0,t.jsxs)("div",{className:"flex items-center gap-2",children:[(0,t.jsxs)("button",{type:"button",onClick:()=>{navigator.clipboard.writeText(O),ex(!0),setTimeout(()=>ex(!1),3e3)},className:"inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-md shadow-teal-600/20 cursor-pointer active:scale-95",children:[eo?(0,t.jsx)(v.Check,{className:"w-4 h-4"}):(0,t.jsx)(E,{className:"w-4 h-4"}),eo?"คัดลอกเรียบร้อย":"คัดลอกคำสั่ง SQL"]}),(0,t.jsx)("button",{type:"button",onClick:()=>ec(!1),className:"px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer",children:"ปิด"})]})]})]})})]})}],23261)},89664,e=>{"use strict";var t=e.i(56420);let s={name:"check",size:24,node:[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]};s.node;let a=(0,t.default)(s);e.s(["Check",0,a],89664)},83967,e=>{"use strict";var t=e.i(56420);let s={name:"circle-x",size:24,node:[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]],aliases:["x-circle"]};s.node;let a=(0,t.default)(s);e.s(["XCircle",0,a],83967)},58925,e=>{"use strict";var t=e.i(56420);let s={name:"key-round",size:24,node:[["path",{d:"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",key:"1s6t7t"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor",key:"w0ekpg"}]]};s.node;let a=(0,t.default)(s);e.s(["KeyRound",0,a],58925)},32781,e=>{"use strict";var t=e.i(56420);let s={name:"loader-circle",size:24,node:[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],aliases:["loader-2"]};s.node;let a=(0,t.default)(s);e.s(["Loader2",0,a],32781)},41120,e=>{"use strict";var t=e.i(56420);let s={name:"refresh-cw",size:24,node:[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]};s.node;let a=(0,t.default)(s);e.s(["RefreshCw",0,a],41120)},66595,e=>{"use strict";var t=e.i(56420);let s={name:"search",size:24,node:[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]]};s.node;let a=(0,t.default)(s);e.s(["Search",0,a],66595)},59659,e=>{"use strict";var t=e.i(56420);let s={name:"trash",size:24,node:[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],aliases:["trash-2"]};s.node;let a=(0,t.default)(s);e.s(["Trash2",0,a],59659)},53138,e=>{"use strict";var t=e.i(56420);let s={name:"triangle-alert",size:24,node:[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]],aliases:["alert-triangle"]};s.node;let a=(0,t.default)(s);e.s(["AlertTriangle",0,a],53138)},82303,e=>{"use strict";var t=e.i(56420);let s={name:"users",size:24,node:[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["path",{d:"M16 3.128a4 4 0 0 1 0 7.744",key:"16gr8j"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87",key:"kshegd"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}]]};s.node;let a=(0,t.default)(s);e.s(["Users",0,a],82303)}]);