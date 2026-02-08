import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class TestPasswordMatch {
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

        String password = "admin123";
        String storedHash = "$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z2EE4XFM3FWJqoYWdLjpmly2";

        boolean matches = encoder.matches(password, storedHash);

        System.out.println("密码: " + password);
        System.out.println("Hash: " + storedHash);
        System.out.println("匹配结果: " + matches);

        // 生成新hash测试
        String newHash = encoder.encode(password);
        System.out.println("新Hash: " + newHash);
        System.out.println("新Hash匹配: " + encoder.matches(password, newHash));
    }
}
