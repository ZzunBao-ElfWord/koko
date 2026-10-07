// KOKO 管理后台 —— MongoDB 最小权限账号初始化（幂等，可重复执行）
//
// 执行方式（在服务器上）：
//   export MONGO_ADMIN_BFF_PWD='一个强密码'
//   docker exec -i <mongo容器名> mongosh \
//     --authenticationDatabase admin -u <管理员账号> -p '<管理员密码>' \
//     deploy/mongo-init.js
//
// 若容器内没有挂载该文件，可直接粘贴本脚本内容到 mongosh 交互 shell 执行。
//
// 权限设计：
//   - revolt 库：find（全部集合） + update（仅 users / safety_reports 两个集合）
//   - koko_admin 库：readWrite（后台账号、审计日志）
//   - 不含 dropCollection / dropDatabase / createUser 等任何高危动作

const ADMIN_DB = 'admin';
const REVOLT_DB = 'revolt';
const APP_DB = 'koko_admin';
const ROLE_NAME = 'koko_revolt_moderation';
const USER_NAME = 'koko_admin_bff';

const password = process.env.MONGO_ADMIN_BFF_PWD;
if (!password || password.length < 16) {
  quit('请先设置环境变量 MONGO_ADMIN_BFF_PWD（至少 16 位强密码）', 1);
}

const admin = db.getSiblingDB(ADMIN_DB);

// 1) 自定义角色（collection "" 表示库内全部集合的集合级权限，不含系统集合）
const roleDef = {
  role: ROLE_NAME,
  privileges: [
    {
      resource: { db: REVOLT_DB, collection: '' },
      actions: ['find'],
    },
    {
      resource: { db: REVOLT_DB, collection: 'users' },
      actions: ['find', 'update'],
    },
    {
      resource: { db: REVOLT_DB, collection: 'safety_reports' },
      actions: ['find', 'update'],
    },
  ],
  roles: [],
};

try {
  admin.createRole(roleDef);
  print('[ok] 角色已创建: ' + ROLE_NAME);
} catch (e) {
  if (e.codeName === 'DuplicateKey' || e.codeName === 'RoleAlreadyExists' || e.code === 51002) {
    admin.updateRole(ROLE_NAME, {
      privileges: roleDef.privileges,
    });
    print('[ok] 角色已存在，已按最新定义更新: ' + ROLE_NAME);
  } else {
    throw e;
  }
}

// 2) 业务账号
const userDef = {
  user: USER_NAME,
  pwd: password,
  roles: [
    { role: ROLE_NAME, db: ADMIN_DB },
    { role: 'readWrite', db: APP_DB },
  ],
};

try {
  admin.createUser(userDef);
  print('[ok] 账号已创建: ' + USER_NAME);
} catch (e) {
  if (e.codeName === 'DuplicateKey' || e.codeName === 'UserAlreadyExists' || e.code === 51003) {
    admin.updateUser(USER_NAME, {
      pwd: password,
      roles: userDef.roles,
    });
    print('[ok] 账号已存在，密码与角色已更新: ' + USER_NAME);
  } else {
    throw e;
  }
}

print('[done] 最小权限账号初始化完成');
