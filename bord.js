const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const app = express();

// MySQL 연결 풀 설정
var pool  = mysql.createPool({
    connectionLimit : 10,
    host            : 'localhost',
    user            : 'root',
    password        : '0930',
    database        : 'firstdatabase'  // bord 데이터베이스 사용
});

// bodyParser 설정
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 임시로 로그인된 사용자 ID를 사용 (로그인 기능을 추가하면 여기서 세션을 이용)
const loggedInUserId = 'q'; // 임시로 로그인된 사용자 ID

// 게시물 작성 폼 (HTML에서 입력받을 경우)
app.get('/new-post', (req, res) => {
    res.send(`
        <form action="/add-post" method="POST">
            <label for="title">Title:</label><br>
            <input type="text" id="title" name="title"><br>
            <label for="bord_text">Content:</label><br>
            <textarea id="bord_text" name="bord_text"></textarea><br>
            <input type="submit" value="저장">
            <a href="/blogbord">돌아가기</a><br><br>
        </form>
    `);
});

// 게시물 저장
app.post('/add-post', (req, res) => {
    const title = req.body.title;     // 게시글 제목
    const bordText = req.body.bord_text;  // 게시글 내용

    // 로그인된 사용자의 ID를 자동으로 사용하여 게시글 삽입
    pool.getConnection(function(err, connection) {
        if (err) {
            console.error("Error connecting to the database: " + err);
            res.status(500).send("Database connection error");
            return;
        }

        // 게시글 삽입 쿼리
        const insertQuery = 'INSERT INTO bordtable (title, bord_text, id) VALUES (?, ?, ?)';

        connection.execute(insertQuery, [title, bordText, loggedInUserId], function (err, result) {
            connection.release(); // 쿼리 완료 후 연결 해제

            if (err) {
                res.status(500).send("Error inserting post");
                throw err;
            }

            // 게시글 저장 후 조회 페이지로 이동할 버튼을 포함한 HTML 응답
            res.send(`
                <p>Post added successfully!</p>
                <form action="/blogbord" method="GET">
                    <input type="submit" value="Go to blog posts">
                </form>
            `);
        });
    });
});

// 게시물 조회
app.get('/blogbord', (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error("Error connecting to the database: " + err);
            res.status(500).send("Database connection error");
            return;
        }

        // num 필드를 초기화하고 갱신하는 두 개의 쿼리
        const numResetQuery = 'SET @count = 0;';
        const numUpdateQuery = 'UPDATE bordtable SET num = @count := @count + 1;';

        // num 필드 초기화 및 갱신
        connection.execute(numResetQuery, (err) => {
            if (err) {
                connection.release();
                console.error("Error resetting num values: " + err);
                res.status(500).send("Error resetting post numbers");
                return;
            }

            connection.execute(numUpdateQuery, (err) => {
                if (err) {
                    connection.release();
                    console.error("Error updating num values: " + err);
                    res.status(500).send("Error updating post numbers");
                    return;
                }

                // 게시글 조회 쿼리
                const selectQuery = 'SELECT * FROM bordtable';
                connection.execute(selectQuery, (err, results) => {
                    connection.release();

                    if (err) {
                        res.status(500).send("Error fetching posts");
                        throw err;
                    }

                    // 게시글 목록을 HTML로 반환, 제목 클릭 시 개별 게시물로 이동
                    let postsHtml = `
                        <style>
                            ul {
                                list-style-type: none;  /* 목록 점 제거 */
                                padding: 0;  /* 기본 패딩 제거 */
                            }
                            li {
                                margin-bottom: 10px;  /* 항목 간 간격 */
                            }
                        </style>
                        <h2>Blog Posts</h2>
                        <ul>`;

                    results.forEach(post => {
                        postsHtml += `<li><a href="/post/${post.num}">${post.title}</a></li>`;
                    });
                    postsHtml += '</ul>';

                    // 게시물 목록과 함께 생성 버튼 추가
                    postsHtml += `
                        <form action="/new-post" method="GET">
                            <input type="submit" value="생성">
                        </form>
                    `;

                    res.send(postsHtml);
                });
            });
        });
    });
});



// 개별 게시물 조회
app.get('/post/:postId', (req, res) => {
    const postId = req.params.postId;

    pool.getConnection((err, connection) => {
        if (err) {
            console.error("Error connecting to the database: " + err);
            res.status(500).send("Database connection error");
            return;
        }

        const selectQuery = 'SELECT * FROM bordtable WHERE num = ?';  // 특정 게시글 조회
        connection.execute(selectQuery, [postId], (err, results) => {
            connection.release();

            if (err) {
                res.status(500).send("Error fetching post");
                throw err;
            }

            if (results.length === 0) {
                res.status(404).send("Post not found");
                return;
            }

            const post = results[0];
            const canEditOrDelete = post.id === loggedInUserId; // 작성자 ID 비교

            // 관리자 여부 확인
            const adminQuery = 'SELECT COUNT(*) AS isAdmin FROM admin WHERE id = ?';
            connection.execute(adminQuery, [loggedInUserId], (err, adminResults) => {
                if (err) {
                    res.status(500).send("Error checking admin status");
                    throw err;
                }

                const isAdmin = adminResults[0].isAdmin > 0; // admin 테이블에 사용자 존재 여부

                // 수정 및 삭제 권한 부여
                const showEditDeleteButtons = canEditOrDelete || isAdmin;

                res.send(`
                    <h2>${post.title}</h2>
                    <p>${post.bord_text}</p>
                    <a href="/blogbord">돌아가기</a><br><br>

                    ${showEditDeleteButtons ? `
                    <!-- 수정 및 삭제 버튼 -->
                    <form action="/edit-post/${post.num}" method="GET" style="display:inline;">
                        <input type="submit" value="수정">
                    </form>
                    <form action="/delete-post/${post.num}" method="POST" style="display:inline;">
                        <input type="submit" value="삭제">
                    </form>
                    ` : ''} <!-- 로그인한 사용자가 만든 게시물이 아닐 경우 버튼 숨기기 -->
                `);
            });
        });
    });
});


// 게시물 수정 폼
app.get('/edit-post/:postId', (req, res) => {
    const postId = req.params.postId;

    pool.getConnection((err, connection) => {
        if (err) {
            console.error("Error connecting to the database: " + err);
            res.status(500).send("Database connection error");
            return;
        }

        const selectQuery = 'SELECT * FROM bordtable WHERE num = ?';  // 특정 게시글 조회
        connection.execute(selectQuery, [postId], (err, results) => {
            connection.release();

            if (err) {
                res.status(500).send("Error fetching post");
                throw err;
            }

            if (results.length === 0) {
                res.status(404).send("Post not found");
                return;
            }

            const post = results[0];

            // 관리자 여부 확인
            pool.getConnection((err, connection) => {
                if (err) {
                    console.error("Error connecting to the database: " + err);
                    res.status(500).send("Database connection error");
                    return;
                }

                const adminQuery = 'SELECT COUNT(*) AS isAdmin FROM admin WHERE id = ?';
                connection.execute(adminQuery, [loggedInUserId], (err, adminResults) => {
                    connection.release();

                    if (err) {
                        res.status(500).send("Error checking admin status");
                        throw err;
                    }

                    const isAdmin = adminResults[0].isAdmin > 0; // admin 테이블에 사용자 존재 여부
                    const canEditOrDelete = post.id === loggedInUserId || isAdmin; // 작성자이거나 관리자일 경우 권한 부여

                    if (!canEditOrDelete) {
                        return res.status(403).send("You are not allowed to edit this post");
                    }

                    res.send(`
                        <form action="/update-post/${post.num}" method="POST">
                            <label for="title">Title:</label><br>
                            <input type="text" id="title" name="title" value="${post.title}"><br>
                            <label for="bord_text">Content:</label><br>
                            <textarea id="bord_text" name="bord_text">${post.bord_text}</textarea><br>
                            <input type="submit" value="Update">
                        </form>
                    `);
                });
            });
        });
    });
});


// 게시물 업데이트
app.post('/update-post/:postId', (req, res) => {
    const postId = req.params.postId;
    const updatedTitle = req.body.title;
    const updatedContent = req.body.bord_text;

    pool.getConnection((err, connection) => {
        if (err) {
            console.error("Error connecting to the database: " + err);
            res.status(500).send("Database connection error");
            return;
        }

        const updateQuery = 'UPDATE bordtable SET title = ?, bord_text = ? WHERE num = ?';
        connection.execute(updateQuery, [updatedTitle, updatedContent, postId], (err, result) => {
            connection.release();

            if (err) {
                res.status(500).send("Error updating post");
                throw err;
            }

            res.send(`
                <p>Post updated successfully!</p>
                <a href="/post/${postId}">Go back to post</a>
            `);
        });
    });
});

// 게시물 삭제
app.post('/delete-post/:postId', (req, res) => {
    const postId = req.params.postId;

    pool.getConnection((err, connection) => {
        if (err) {
            console.error("Error connecting to the database: " + err);
            res.status(500).send("Database connection error");
            return;
        }

        const selectQuery = 'SELECT * FROM bordtable WHERE num = ?';  // 특정 게시글 조회
        connection.execute(selectQuery, [postId], (err, results) => {
            if (err) {
                connection.release();
                res.status(500).send("Error fetching post");
                throw err;
            }

            if (results.length === 0) {
                connection.release();
                res.status(404).send("Post not found");
                return;
            }

            const post = results[0];

            // 관리자 여부 확인
            pool.getConnection((err, connection) => {
                if (err) {
                    console.error("Error connecting to the database: " + err);
                    res.status(500).send("Database connection error");
                    return;
                }

                const adminQuery = 'SELECT COUNT(*) AS isAdmin FROM admin WHERE id = ?';
                connection.execute(adminQuery, [loggedInUserId], (err, adminResults) => {
                    if (err) {
                        connection.release();
                        res.status(500).send("Error checking admin status");
                        throw err;
                    }

                    const isAdmin = adminResults[0].isAdmin > 0; // admin 테이블에 사용자 존재 여부
                    const canDelete = post.id === loggedInUserId || isAdmin; // 작성자이거나 관리자일 경우 삭제 권한 부여

                    if (!canDelete) {
                        connection.release();
                        return res.status(403).send("You are not allowed to delete this post");
                    }

                    const deleteQuery = 'DELETE FROM bordtable WHERE num = ?';
                    connection.execute(deleteQuery, [postId], (err, result) => {
                        connection.release();

                        if (err) {
                            res.status(500).send("Error deleting post");
                            throw err;
                        }

                        res.send(`
                            <p>Post deleted successfully!</p>
                            <a href="/blogbord">Go back to posts</a>
                        `);
                    });
                });
            });
        });
    });
});


// 서버 실행
app.listen(3000, () => {
    console.log('Server running on port 3000');
});
