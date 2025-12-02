// ... (Các phần cấu hình giữ nguyên) ...
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwnyXJe-R8lpM7vlgn8t5oehSr8-rGAcz2JPkmljGaraNS9Csup8bivahBKxdodo5m0/exec'; 

// --- CÁC BIẾN TOÀN CỤC ---
let questions = [];          
let currentQuestion = 0;     
let userAnswers = [];        
let timerInterval;           
let timeLeft = 1800;         
let currentUserRole = '';    
let currentLoginUser = '';   
let startTime;               
let isReviewMode = false;
// --- BIẾN MỚI CHO VIỆC CHỐNG GIAN LẬN ---
let violationCount = 0;      // Đếm số lần vi phạm
const MAX_VIOLATIONS = 3;    // Giới hạn số lần cho phép
let isQuizActive = false;    // Trạng thái đang làm bài (để chặn check khi chưa thi)

// ... (Phần Đăng nhập giữ nguyên) ...
document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const spinner = document.getElementById('loadingSpinner');
    const errorMsg = document.getElementById('loginError');
    
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('YOUR_GOOGLE_APPS_SCRIPT_URL_HERE')) {
        errorMsg.textContent = "Lỗi: Chưa nhập link Google Apps Script!";
        errorMsg.style.display = "block";
        return;
    }

    errorMsg.style.display = "none";
    loginBtn.disabled = true;
    spinner.style.display = "block";
    loginBtn.querySelector('span').textContent = "Đang kiểm tra...";

    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    fetch(`${GOOGLE_SCRIPT_URL}?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'already_taken') {
                loginBtn.disabled = false;
                spinner.style.display = "none";
                loginBtn.querySelector('span').textContent = "Đăng nhập";
                showLeaderboard(data.yourName, data.leaderboard, data.pdfLink);
                return;
            }
            if (data.status === 'success') {
                loginBtn.querySelector('span').textContent = "Đang tải đề thi...";
                currentUserRole = data.role; 
                currentLoginUser = user;
                return fetch(`${GOOGLE_SCRIPT_URL}?action=get_questions`)
                    .then(qResponse => qResponse.json())
                    .then(qData => {
                        if (qData.status === 'success') {
                            questions = qData.data;
                            if (!questions || questions.length === 0) throw new Error('Danh sách câu hỏi trống.');
                            startQuiz(data.name);
                        } else {
                            throw new Error('Không thể tải bộ câu hỏi.');
                        }
                    });
            } else {
                throw new Error(data.message || 'Sai thông tin đăng nhập');
            }
        })
        .catch(error => {
            errorMsg.textContent = error.message;
            errorMsg.style.display = "block";
            loginBtn.disabled = false;
            spinner.style.display = "none";
            loginBtn.querySelector('span').textContent = "Đăng nhập";
        });
});

function showLeaderboard(name, leaderboardData, pdfLink) {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('leaderboardContainer').style.display = 'block';
    document.getElementById('welcomeBackUser').textContent = `Chào mừng trở lại, ${name}`;
    
    const pdfBtn = document.getElementById('oldPdfLinkBtn');
    if (pdfLink && pdfLink.startsWith('http')) {
        pdfBtn.href = pdfLink;
        pdfBtn.style.display = 'inline-block';
    } else {
        pdfBtn.style.display = 'none';
    }
    
    const tbody = document.getElementById('leaderboardBody');
    tbody.innerHTML = '';
    leaderboardData.forEach(row => {
        const tr = document.createElement('tr');
        if (row.top == 1) tr.classList.add('rank-1');
        else if (row.top == 2) tr.classList.add('rank-2');
        else if (row.top == 3) tr.classList.add('rank-3');
        tr.innerHTML = `<td>${row.top || '-'}</td><td>${row.name}</td><td>${row.score}</td><td>${row.time || '--'}</td>`;
        tbody.appendChild(tr);
    });
}

function startQuiz(fullName) {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('quizContainer').style.display = 'block';
    userAnswers = new Array(questions.length).fill(null);
    currentQuestion = 0;
    isReviewMode = false;
    violationCount = 0; // Reset vi phạm
    isQuizActive = true; // Bắt đầu theo dõi
    
    document.getElementById('userName').textContent = `Thí sinh: ${fullName}`;
    document.getElementById('questionCount').textContent = `Tổng số câu: ${questions.length}`;
    document.getElementById('finishReviewBtn').style.display = 'none';
    startTime = new Date();
    
    try { loadQuestion(); } catch (e) { document.getElementById('questionContainer').innerHTML = `<p style="color:red">Lỗi: ${e.message}</p>`; }
    startTimer();

    // Bắt đầu lắng nghe sự kiện rời màn hình
    document.addEventListener("visibilitychange", handleVisibilityChange);
}

// --- HÀM XỬ LÝ VI PHẠM ---
function handleVisibilityChange() {
    // Chỉ kiểm tra khi đang thi và tab bị ẩn
    if (isQuizActive && document.hidden) {
        violationCount++;
        document.getElementById('violationCountDisplay').textContent = violationCount;
        
        // Hiện Modal cảnh báo
        document.getElementById('violationModal').style.display = 'block';

        // Nếu quá giới hạn -> Nộp luôn
        if (violationCount > MAX_VIOLATIONS) {
            isQuizActive = false; // Dừng theo dõi để không loop
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            alert("Bạn đã vi phạm quy chế thi quá 3 lần. Bài thi sẽ tự động nộp ngay lập tức!");
            closeViolationModal(); // Đóng modal cảnh báo
            submitQuiz(true); // Gọi nộp bài (forceSubmit = true)
        }
    }
}

function closeViolationModal() {
    document.getElementById('violationModal').style.display = 'none';
}

function loadQuestion() {
    if (!questions || !questions[currentQuestion]) return;
    const question = questions[currentQuestion];
    const container = document.getElementById('questionContainer');
    const options = Array.isArray(question.options) ? question.options : [];
    container.innerHTML = `
        <div class="question-card">
            <div class="question-number">Câu ${currentQuestion + 1}/${questions.length}</div>
            <div class="question-text">${question.question || "Lỗi nội dung"}</div>
            <div class="options">
                ${options.map((option, index) => {
                    let additionalClass = '';
                    let isChecked = (userAnswers[currentQuestion] === index);
                    if (isReviewMode) {
                        additionalClass += ' disabled';
                        if (index === question.correct) additionalClass += ' review-correct';
                        else if (isChecked && index !== question.correct) additionalClass += ' review-wrong';
                    } else {
                        if (currentUserRole === 'ad' && index === question.correct) additionalClass += ' admin-hint';
                    }
                    return `
                    <label class="option ${isChecked ? 'selected' : ''} ${additionalClass}">
                        <input type="radio" name="answer" value="${index}" ${isChecked ? 'checked' : ''} ${isReviewMode ? 'disabled' : ''} onchange="selectAnswer(${index})">
                        ${option || "Trống"}
                    </label>
                `}).join('')}
            </div>
        </div>
    `;
    document.getElementById('prevBtn').disabled = currentQuestion === 0;
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    const finishReviewBtn = document.getElementById('finishReviewBtn');
    if (currentQuestion === questions.length - 1) {
        nextBtn.style.display = 'none';
        if (isReviewMode) {
            submitBtn.style.display = 'none';
            finishReviewBtn.style.display = 'block';
        } else {
            submitBtn.style.display = 'block';
            finishReviewBtn.style.display = 'none';
        }
    } else {
        nextBtn.style.display = 'block';
        submitBtn.style.display = 'none';
        finishReviewBtn.style.display = 'none';
    }
}

function selectAnswer(index) {
    if (isReviewMode) return;
    userAnswers[currentQuestion] = index;
    const options = document.querySelectorAll('.option');
    options.forEach((opt, i) => {
        const isHint = opt.classList.contains('admin-hint');
        if (i === index) {
            opt.className = `option selected ${isHint ? 'admin-hint' : ''}`;
            opt.querySelector('input').checked = true;
        } else {
            opt.className = `option ${isHint ? 'admin-hint' : ''}`;
        }
    });
}

function nextQuestion() { if (currentQuestion < questions.length - 1) { currentQuestion++; loadQuestion(); } }
function previousQuestion() { if (currentQuestion > 0) { currentQuestion--; loadQuestion(); } }

// --- HÀM NỘP BÀI (CÓ THAM SỐ FORCE SUBMIT) ---
function submitQuiz(forceSubmit = false) {
    // Nếu không phải ép buộc nộp (do hết giờ hoặc vi phạm) thì mới check câu hỏi
    if (!forceSubmit && timeLeft > 0) { 
        let missingIndices = [];
        for (let i = 0; i < questions.length; i++) {
            if (userAnswers[i] === null || userAnswers[i] === undefined) {
                missingIndices.push(i); 
            }
        }
        if (missingIndices.length > 0) {
            showWarningModal(missingIndices);
            return;
        }
    }

    // Dừng theo dõi vi phạm
    isQuizActive = false;
    document.removeEventListener("visibilitychange", handleVisibilityChange);

    clearInterval(timerInterval);
    let correctCount = 0; 
    let detailsForPdf = []; 
    userAnswers.forEach((answer, index) => {
        if (!questions[index]) return;
        const isCorrect = (answer === questions[index].correct);
        if (isCorrect) correctCount++;
        const optionText = (questions[index].options && answer !== null) ? questions[index].options[answer] : "Không chọn";
        detailsForPdf.push({ question: questions[index].question, userAnswer: optionText, isCorrect: isCorrect });
    });
    
    let totalQuestions = questions.length;
    let score100 = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    let endTime = new Date();
    let timeDiff = Math.floor((endTime - startTime) / 1000); 
    let minutesSpent = Math.floor(timeDiff / 60);
    let secondsSpent = timeDiff % 60;
    let timeString = `${minutesSpent} phút ${secondsSpent} giây`;
    
    document.getElementById('quizContainer').style.display = 'none';
    document.getElementById('resultContainer').style.display = 'block';
    document.getElementById('processingMessage').style.display = 'block';
    document.getElementById('pdfResultArea').style.display = 'none'; 
    document.getElementById('scoreArea').style.display = 'none';
    document.getElementById('viewScoreBtn').style.display = 'none';
    document.getElementById('reviewQuizBtn').style.display = 'none';
    
    document.getElementById('resultScore').textContent = `${score100}`;
    
    let message = '';
    if (score100 >= 80) message = 'Xuất sắc!'; else if (score100 >= 60) message = 'Khá tốt!'; else message = 'Cần cố gắng thêm!';
    // Nếu bị ép nộp
    if (forceSubmit) {
        message = 'Bài thi đã bị nộp tự động do vi phạm quy chế thi!';
        document.getElementById('resultMessage').style.color = 'red';
    }
    document.getElementById('resultMessage').textContent = message;
    
    const userNameRaw = document.getElementById('userName').textContent.replace('Thí sinh: ', '').trim();
    const payload = {
        loginUser: currentLoginUser,
        userName: userNameRaw,       
        timeString: timeString,
        scoreText: score100, 
        details: detailsForPdf
    };
    
    fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            document.getElementById('processingMessage').style.display = 'none';
            document.getElementById('pdfResultArea').style.display = 'block';
            document.getElementById('pdfLinkBtn').href = data.pdfUrl;
            document.getElementById('viewScoreBtn').style.display = 'inline-block';
            document.getElementById('reviewQuizBtn').style.display = 'inline-block';
        } else {
            document.getElementById('processingMessage').textContent = 'Lỗi lưu trữ: ' + data.message;
            document.getElementById('processingMessage').style.color = 'red';
            document.getElementById('viewScoreBtn').style.display = 'inline-block';
            document.getElementById('reviewQuizBtn').style.display = 'inline-block';
        }
    }).catch(err => {
        document.getElementById('processingMessage').textContent = 'Lỗi kết nối server!';
        console.error(err);
        document.getElementById('viewScoreBtn').style.display = 'inline-block';
        document.getElementById('reviewQuizBtn').style.display = 'inline-block';
    });
}

function showWarningModal(indices) {
    const listDiv = document.getElementById('missingQuestionsList');
    listDiv.innerHTML = ''; 
    indices.forEach(index => {
        const badge = document.createElement('span');
        badge.className = 'missing-question-badge';
        badge.textContent = `Câu ${index + 1}`;
        badge.onclick = function() { jumpToQuestion(index); };
        listDiv.appendChild(badge);
    });
    document.getElementById('warningModal').style.display = 'block';
}

function closeWarningModal() { document.getElementById('warningModal').style.display = 'none'; }
function jumpToQuestion(index) { currentQuestion = index; loadQuestion(); closeWarningModal(); }
function showScore() { document.getElementById('scoreArea').style.display = 'block'; document.getElementById('viewScoreBtn').style.display = 'none'; }
function reviewQuiz() { isReviewMode = true; currentQuestion = 0; document.getElementById('resultContainer').style.display = 'none'; document.getElementById('quizContainer').style.display = 'block'; document.getElementById('quizTitle').textContent = "Xem lại bài làm (Chỉ đọc)"; document.getElementById('timer').textContent = "Đã hoàn thành"; loadQuestion(); }
function finishReview() { document.getElementById('quizContainer').style.display = 'none'; document.getElementById('resultContainer').style.display = 'block'; document.getElementById('quizTitle').textContent = "Bài Thi Trắc Nghiệm Y Tế"; }
function logout() { window.location.reload(); }
function restartQuiz() { location.reload(); }
function startTimer() { if (timerInterval) clearInterval(timerInterval); if (!timeLeft || timeLeft <= 0) timeLeft = 1800; timerInterval = setInterval(() => { timeLeft--; const minutes = Math.floor(timeLeft / 60); const seconds = timeLeft % 60; document.getElementById('timer').textContent = `Thời gian: ${minutes}:${seconds.toString().padStart(2, '0')}`; if (timeLeft <= 0) { submitQuiz(true); } }, 1000); }