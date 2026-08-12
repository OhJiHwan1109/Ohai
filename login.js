const supabaseUrl = "https://ozixlswgmovdiekujgnl.supabase.co";
const supabaseKey = "sb_publishable_gdykHlieC8UwYAiVKtiVBg_ktseJ2-o";


const client = window.supabase.createClient(
    supabaseUrl,
    supabaseKey
);


document.getElementById("login").onclick = async () => {

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    console.log("로그인 시도");
    console.log("email:", email);

    const { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password
    });

    console.log("결과:", data, error);

    if (error) {
        alert("이메일 또는 비밀번호가 다릅니다.");
        console.log(error);
        return;
    }

    alert("로그인 성공!");
    location.href = "index.html";
};