const inputEl = document.querySelector('#question');
const btnEl = document.querySelector('#askBtn');
const answerEl = document.querySelector('#answer');
const historyEl = document.querySelector('#history');

async function renderHistory() {
    const res = await fetch('/api/history?limit=20');
    const json = await res.json();
    if(json.ok && Array.isArray(json.data)){
        historyEl.innerHTML = '';
        json.data.forEach(item=>{
            const div = document.createElement('div');
            div.setAttribute('data-testid', 'history-item');
            div.style.padding='4px 0';
            div.textContent = `Q:${item.question} | A:${item.answer}`;
            historyEl.appendChild(div);
        })
    }
}

btnEl.addEventListener('click', async ()=>{
    const q = inputEl.value.trim();
    if(!q){
        alert("问题不能为空");
        return;
    }
    btnEl.disabled = true;
    btnEl.textContent = "思考中…";
    answerEl.textContent = "请求中……";
    try{
        const resp = await fetch('/api/ask', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ question: q })
                           })

        const ret = await resp.json();
        if(ret.ok){
            answerEl.textContent = ret.data.answer;
            await renderHistory();
        }else{
            answerEl.textContent = "错误："+ret.error;
        }
    }catch(err){
        answerEl.textContent = "网络异常："+String(err);
    }finally{
        btnEl.disabled = false;
        btnEl.textContent = "提交提问";
    }
});

// 页面加载渲染历史
window.addEventListener('load',renderHistory);
