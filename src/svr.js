    const express = require('express'); // Express 모듈 불러오기
    const mysql = require('mysql2'); // MySQL 데이터베이스 모듈 불러오기
    const path = require('path'); // 파일 경로를 처리하기 위한 모듈
    const static = require('serve-static'); // 정적 파일 제공을 위한 모듈
    const bcrypt = require('bcrypt'); // 비밀번호 해싱을 위한 모듈
    const session = require('express-session'); // 세션 관리를 위한 모듈
    const cors = require('cors'); // CORS(교차 출처 리소스 공유)를 위한 모듈
    const dbconfig = require('../dbconfig/dbconfig.json'); // 데이터베이스 설정 파일 불러오기
    require('dotenv').config(); // 환경 변수를 불러오기 위한 모듈

    // Database connection pool 설정
    const pool = mysql.createPool({
        connectionLimit: 10, // 최대 연결 수
        host: dbconfig.host, // 데이터베이스 호스트
        user: dbconfig.user, // 데이터베이스 사용자 이름
        password: dbconfig.password, // 데이터베이스 비밀번호
        database: dbconfig.database, // 사용할 데이터베이스 이름
        debug: false // 디버그 모드 비활성화
    });

    const app = express(); // Express 앱 생성
    app.use(express.urlencoded({ extended: true })); // URL-encoded 데이터 처리
    app.use(express.json()); // JSON 데이터 처리
    app.use('/public', static(path.join(__dirname, 'public'))); // 정적 파일 제공 설정

    // CORS 설정
    app.use(cors({
        origin: 'http://127.0.0.1:5500', // 허용할 출처
        methods: ['GET', 'POST', 'OPTIONS'], // 허용할 HTTP 메서드
        credentials: true, // 인증 정보를 포함할지 여부
    }));

    // 세션 설정
    app.use(session({
        secret: process.env.SESSION_SECRET || '0930', // 세션 비밀 키
        resave: false, // 세션을 다시 저장할지 여부
        saveUninitialized: true, // 초기화되지 않은 세션을 저장할지 여부
        cookie: { secure: false } // 쿠키 보안 설정
    }));

    // 세션 정보 확인을 위한 엔드포인트
    app.get('/process/session', (req, res) => {
        if (req.session.userId) {
            // 세션에 사용자 정보가 있을 경우
            res.json({
                userId: req.session.userId, // 사용자 ID
                userName: req.session.userName, // 사용자 이름
                userAge: req.session.userAge // 사용자 나이
            });
        } else {
            // 세션에 사용자 정보가 없을 경우
            res.status(401).json({ message: '로그인하지 않았습니다' });
        }
    });

    // 로그인 처리
    app.post('/process/login', async (req, res) => {    
        const paramId = req.body.id; // 요청 본문에서 ID 가져오기
        const paramPassword = req.body.password; // 요청 본문에서 비밀번호 가져오기

        console.log('로그인 요청: ' + paramId + ', ' + paramPassword);

        pool.getConnection((err, conn) => {
            if (err) {
                console.log('Mysql getConnection error. aborted');
                return res.status(500).send('<h1>SQL 연결 실패</h1>'); // 연결 실패 시 오류 메시지 반환
            }

            // 사용자 정보를 가져올 때 나이도 포함
            const sql = 'SELECT id, name, age, password FROM users WHERE id = ?';

            conn.query(sql, [paramId], async (err, rows) => {
                conn.release(); // 연결 반환

                if (err) {
                    console.log('SQL 실행 중 오류 발생:', err);
                    return res.status(500).send('<h1>SQL 실행 실패</h1>'); // SQL 실행 실패 시 오류 메시지 반환
                }

                if (rows.length > 0) {
                    const user = rows[0]; // 첫 번째 결과 행 가져오기
                    const isPasswordValid = await bcrypt.compare(paramPassword, user.password); // 비밀번호 확인

                    if (isPasswordValid) {
                        // 로그인 성공 시 세션에 사용자 정보 저장
                        req.session.userId = user.id; // 사용자 ID 저장
                        req.session.userName = user.name; // 사용자 이름 저장
                        req.session.userAge = user.age; // 사용자 나이 저장

                        console.log('세션에 저장된 정보:', req.session); // 세션 정보 로그 출력

                        console.log('로그인 성공: ' + user.name);
                        res.send(`
                            <h2>로그인 성공</h2>
                            <p>${user.name}님, 환영합니다!</p>
                            <p>당신의 나이: ${user.age}</p>
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
