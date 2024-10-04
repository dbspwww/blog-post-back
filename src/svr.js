const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const static = require('serve-static');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cors = require('cors');
const dbconfig = require('../dbconfig/dbconfig.json');
require('dotenv').config();

const pool = mysql.createPool({
    connectionLimit: 10,
    host: dbconfig.host,
    user: dbconfig.user,
    password: dbconfig.password,
    database: dbconfig.database,
    debug: false
});

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', static(path.join(__dirname, 'public')));

// CORS 설정
const corsOptions = {
    origin: 'http://localhost:3000', // React 앱의 주소
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true, // 자격 증명 포함
};

app.use(cors(corsOptions));

// 세션 설정
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // HTTPS 사용 시 true로 설정
    },
}));

// 로그아웃 처리
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: '로그아웃 실패' });
        }
        res.clearCookie('connect.sid'); // 쿠키 삭제
        res.status(200).json({ message: '로그아웃 성공' });
    });
});

app.use(session({
    secret: process.env.SESSION_SECRET || '0930',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.get('/process/session', (req, res) => {
    if (req.session.userId) {
        res.json({
            userId: req.session.userId,
            userName: req.session.userName,
            userAge: req.session.userAge
        });
    } else {
        res.status(401).json({ message: '로그인하지 않았습니다' });
    }
});

app.post('/process/login', async (req, res) => {
    const paramId = req.body.id;
    const paramPassword = req.body.password;

    console.log('로그인 요청: ' + paramId + ', ' + paramPassword);

    pool.getConnection((err, conn) => {
        if (err) {
            console.log('Mysql getConnection error. aborted');
            return res.status(500).send('<h1>SQL 연결 실패</h1>');
        }

        const sql = 'SELECT id, name, age, password FROM users WHERE id = ?';

        conn.query(sql, [paramId], async (err, rows) => {
            conn.release();

            if (err) {
                console.log('SQL 실행 중 오류 발생:', err);
                return res.status(500).send('<h1>SQL 실행 실패</h1>');
            }

            if (rows.length > 0) {
                const user = rows[0];
                const isPasswordValid = await bcrypt.compare(paramPassword, user.password);

                if (isPasswordValid) {
                    req.session.userId = user.id;
                    req.session.userName = user.name;
                    req.session.userAge = user.age;

                    console.log('로그인 성공: ' + user.name);
                    res.send(user.name);
                } else {
                    console.log('로그인 실패: 비밀번호 불일치');
                    res.status(401).send('<h2>로그인 실패: 비밀번호를 확인하세요</h2>');
                }
            } else {
                console.log('로그인 실패: ID가 존재하지 않음');
                res.status(401).send('<h2>로그인 실패: ID를 찾을 수 없습니다</h2>');
            }
        });
    });
});

// 관리자 로그인 처리
app.post('/process/admin/login', async (req, res) => {
    const { id, password } = req.body; // 클라이언트로부터 받은 데이터

    console.log('관리자 로그인 요청: ' + id);

    pool.getConnection((err, conn) => {
        if (err) {
            console.log('Mysql getConnection error. aborted');
            return res.status(500).send('<h1>SQL 연결 실패</h1>');
        }

        // admin 테이블에서 사용자 정보를 가져오기
        const sql = 'SELECT id, name, password FROM admin WHERE id = ?';
        conn.query(sql, [id], async (err, rows) => {
            conn.release(); // 연결 반환

            if (err) {
                console.log('SQL 실행 중 오류 발생:', err);
                return res.status(500).send('<h1>SQL 실행 실패</h1>');
            }

            console.log('쿼리 결과:', rows); // 쿼리 결과 로그

            if (rows.length > 0) {
                const admin = rows[0]; // 첫 번째 결과 행 가져오기
                console.log('찾은 관리자 정보:', admin); // 관리자 정보 로그

                // 비밀번호 확인
                const isPasswordValid = await bcrypt.compare(password, admin.password);
                console.log('입력된 비밀번호:', password); // 입력된 비밀번호 로그
                console.log('저장된 해시:', admin.password); // 저장된 해시 로그
                console.log('비밀번호 검증 결과:', isPasswordValid); // 비밀번호 검증 결과 로그

                if (isPasswordValid) {
                    // 로그인 성공 시 세션에 관리자 정보 저장
                    req.session.adminId = admin.id; // 관리자 ID 저장
                    req.session.adminName = admin.name; // 관리자 이름 저장

                    console.log('관리자 로그인 성공: ' + admin.name);
                    res.send(`
                        <h2>로그인 성공</h2>
                        <p>${admin.name}님, 환영합니다!</p>
                    `); // 로그인 성공 메시지 반환
                } else {
                    console.log('로그인 실패: 비밀번호 불일치');
                    res.status(401).send('<h2>로그인 실패: 비밀번호를 확인하세요</h2>');
                }
            } else {
                console.log('로그인 실패: ID가 존재하지 않음');
                res.status(401).send('<h2>로그인 실패: ID를 찾을 수 없습니다</h2>');
            }
        });
    });
});

// 아이디 중복 확인 처리
app.get('/process/check-id', (req, res) => {
    const userId = req.query.userId;

    pool.getConnection((err, conn) => {
        if (err) {
            console.log('Mysql getConnection error. aborted');
            return res.status(500).send({ message: 'SQL 연결 실패' });
        }

        const sql = 'SELECT COUNT(*) AS count FROM users WHERE id = ?';
        conn.query(sql, [userId], (err, results) => {
            conn.release(); // 연결 반환

            if (err) {
                console.log('SQL 실행 중 오류 발생:', err);
                return res.status(500).send({ message: 'SQL 실행 실패' });
            }

            const count = results[0].count;
            if (count > 0) {
                // 아이디가 이미 존재함
                res.send({ message: '이미 사용 중인 아이디입니다.' });
            } else {
                // 아이디 사용 가능
                res.send({ message: '사용 가능한 아이디입니다.' });
            }
        });
    });
});

// 사용자 추가 처리 (회원가입)
app.post('/process/adduser', async (req, res) => {
    const { id, name, age, password } = req.body; // 클라이언트로부터 받은 데이터

    try {
        // 비밀번호 해싱
        const hashedPassword = await bcrypt.hash(password, 10);

        pool.getConnection((err, conn) => {
            if (err) {
                console.log('Mysql getConnection error. aborted');
                return res.status(500).send('<h1>SQL 연결 실패</h1>');
            }

            // 사용자 정보를 데이터베이스에 삽입
            const sql = 'INSERT INTO users(id, name, age, password) VALUES(?, ?, ?, ?)';
            conn.query(sql, [id, name, age, hashedPassword], (err, result) => {
                conn.release(); // 연결 반환

                if (err) {
                    console.log('SQL 실행 중 오류 발생:', err);
                    return res.status(500).send('<h1>SQL 실행 실패</h1>');
                }

                console.log('사용자 추가 성공');
                // 회원가입 성공 후 메시지 제공
                res.send(`
                    회원가입 성공
                `); // 성공 메시지 반환
            });
        });
    } catch (error) {
        console.log('비밀번호 해싱 중 오류 발생:', error);
        res.status(500).send('<h1>비밀번호 해싱 실패</h1>'); // 오류 메시지 반환
    }
});

// 관리자 추가 처리 (회원가입)
app.post('/process/addadmin', async (req, res) => {
    const { id, name, age, password } = req.body; // 클라이언트로부터 받은 데이터

    try {
        // 비밀번호 해싱
        const hashedPassword = await bcrypt.hash(password, 10);

        pool.getConnection((err, conn) => {
            if (err) {
                console.log('Mysql getConnection error. aborted');
                return res.status(500).send('<h1>SQL 연결 실패</h1>');
            }

            // admin 테이블의 데이터 수를 확인
            const checkAdminSql = 'SELECT COUNT(*) AS count FROM admin';
            conn.query(checkAdminSql, (err, results) => {
                if (err) {
                    console.log('SQL 실행 중 오류 발생:', err);
                    conn.release();
                    return res.status(500).send('<h1>SQL 실행 실패</h1>');
                }

                const adminCount = results[0].count;

                if (adminCount === 0) {
                    // admin 테이블이 비어있다면 사용자 추가
                    const sql = 'INSERT INTO admin(id, name, age, password) VALUES(?, ?, ?, ?)';
                    conn.query(sql, [id, name, age, hashedPassword], (err, result) => {
                        conn.release(); // 연결 반환

                        if (err) {
                            console.log('SQL 실행 중 오류 발생:', err);
                            return res.status(500).send('<h1>SQL 실행 실패</h1>');
                        }

                        console.log('관리자 추가 성공');
                        // 회원가입 성공 후 메시지 제공
                        res.send(`
                            관리자 추가 성공
                        `); // 성공 메시지 반환
                    });
                } else {
                    // admin 테이블에 데이터가 이미 존재하는 경우
                    conn.release(); // 연결 반환
                    return res.status(400).send('<h1>이미 관리자 계정이 존재합니다</h1>');
                }
            });
        });
    } catch (error) {
        console.log('비밀번호 해싱 중 오류 발생:', error);
        res.status(500).send('<h1>비밀번호 해싱 실패</h1>'); // 오류 메시지 반환
    }
});

// 총 회원 수를 구하는 엔드포인트
app.get('/process/userCount', (req, res) => {
    pool.getConnection((err, conn) => {
        if (err) {
            console.log('Mysql getConnection error. aborted');
            return res.status(500).send('<h1>SQL 연결 실패</h1>');
        }

        const sql = 'SELECT COUNT(*) AS count FROM users'; // 사용자 수를 계산하는 쿼리
        conn.query(sql, (err, results) => {
            conn.release(); // 연결 반환

            if (err) {
                console.log('SQL 실행 중 오류 발생:', err);
                return res.status(500).send('<h1>SQL 실행 실패</h1>');
            }

            const userCount = results[0].count; // 사용자 수
            console.log('총 회원 수:', userCount); // 콘솔에 총 회원 수 출력
            res.json({ userCount }); // 클라이언트에 회원 수 반환
        });
    });
});

// 관리자 정보 가져오기
app.get('/process/admininfo', (req, res) => {
    pool.getConnection((err, conn) => {
        if (err) {
            console.log('Mysql getConnection error. aborted');
            return res.status(500).send('<h1>SQL 연결 실패</h1>');
        }

        const sql = 'SELECT id, name, admin_date FROM admin';
        conn.query(sql, (err, rows) => {
            conn.release(); // 연결 반환

            if (err) {
                console.log('SQL 실행 중 오류 발생:', err);
                return res.status(500).send('<h1>SQL 실행 실패</h1>');
            }

            res.json(rows); // 결과를 JSON 형식으로 반환
        });
    });
});


// 로그아웃 처리
app.post('/process/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: '로그아웃 중 오류 발생' });
        }
        res.status(200).json({ message: '로그아웃 성공' });
    });
});

// 서버 시작
app.listen(5500, () => {
    console.log('listening on port 5500');
});
