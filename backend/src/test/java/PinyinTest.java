import cn.hutool.extra.pinyin.PinyinUtil;

public class PinyinTest {
    public static void main(String[] args) {
        String initials = PinyinUtil.getFirstLetter("张三", "");
        System.out.println("Initials: " + initials);
    }
}
